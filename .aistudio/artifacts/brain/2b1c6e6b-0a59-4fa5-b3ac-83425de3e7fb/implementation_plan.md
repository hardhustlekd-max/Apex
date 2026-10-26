# Industry-Standard Database Reset & Full Synchronization Engine

Architectural blueprint and implementation plan for a production-grade, non-blocking asynchronous database reset and data synchronization architecture for the Apex Football Prediction Engine.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed based on your selections to ensure zero-timeout execution and cloud deployment resilience:
> - **Execution Model**: **Async Job with Progress Polling**. When triggered, the server immediately acknowledges the request with an HTTP 202 and a unique Job ID. The browser polls the job's granular step progress (`/api/sync/status/:jobId`), completely eliminating HTTP 504 gateway timeouts and premature `AbortController` cancellations.
> - **Fault-Tolerance Strategy**: **Resilient Hybrid Ingestion with Verified Fallback**. In the event of network timeouts, Cloudflare/Akamai rate-limiting, or `403 Forbidden` responses from remote scrapers, the engine seamlessly fails over to high-coverage cached feeds and verified historical datasets without erroring out.
> - **Cloud Persistence Strategy**: **Dual-Tier Persistent SQLite with `/tmp` Auto-Routing**. Storage dynamically checks filesystem permissions, auto-routing SQLite writes to `/tmp` on serverless environments (Vercel, AWS Lambda) or persistent disk on container runtimes, while maintaining real-time in-memory state and background Turso synchronization.

---

## 1. Overview & Core Concept

### What It Delivers
A resilient, fault-tolerant background synchronization pipeline that allows users to reset local tables, purge stale feed caches, and ingest multi-season historical match data and upcoming fixtures without browser freezes, connection timeouts, or unhandled exceptions.

### Key Value
- **Zero-Timeout Reliability**: Eliminates HTTP 504 and client abort errors by detaching heavy scraping and Poisson mathematical modeling from the synchronous request-response cycle.
- **Granular Visual Telemetry**: Replaces the static spinner with step-by-step progress bars and stage descriptions (e.g., *Purging tables*, *Ingesting tournament feeds [6/12]*, *Computing Poisson xG & Dixon-Coles parameters*, *Finalizing SQLite write*).
- **Environment Agnostic**: Runs predictably in local development, containerized deployments (Docker / Cloud Run), and serverless environments (Vercel) with auto-detecting filesystem fallbacks.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Triggering Reset & Sync**:
   - The user opens **Settings > Data Management** and selects **Reset Database, Raw Feeds & Trigger Full Sync**.
   - A confirmation dialog explains the purge actions with cancel and confirm actions.
2. **Asynchronous Progress Modal / Bar**:
   - Upon confirmation, the modal dispatches `POST /api/providers/sync/start` and receives an immediate `{ jobId, status: "RUNNING" }` response.
   - The UI displays an active progress bar with percentage, current stage tag, and elapsed time counter.
   - The client polls `GET /api/providers/sync/status/:jobId` every 1,000ms.
3. **Completion & Real-Time Hydration**:
   - Once the status reaches `COMPLETED`, the UI displays a clean success banner showing exact metrics (fixtures ingested, models generated, database write time).
   - The fixture list, history view, and provider counters automatically revalidate without requiring a manual page reload.
4. **Resilient Failure Recovery**:
   - If an external scraper endpoint is throttled or times out, the progress banner notes *"Remote endpoint throttled; activated verified hybrid fallback"*, completes the job smoothly, and leaves the database in a consistent, non-corrupted state.

### Visual Styling & Component Hierarchy
- **Typography & Data**: Strictly monospace tabular numerals (`font-mono tabular-nums`) for percentages, elapsed times, and match counters.
- **Color Discipline**:
  - Background: Clean neutral slate card (`bg-white dark:bg-[#121212]`).
  - Active Progress: Vibrant neon lime accent (`#CCFF00`) with smooth transition curves (`cubic-bezier(0.16, 1, 0.3, 1)`).
  - Status Indicators: Text-and-icon pairings (MUI icons only, zero emojis, zero standalone colored dots).
- **Zero-Pill Restraint**: Granular telemetry displayed as inline muted text separated by middle dots (`·`), avoiding nested badge clusters.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Async Job Polling vs. Synchronous Request vs. WebSockets
- **Chosen Approach**: Asynchronous Job Queue with Client Polling.
- **Why**: 
  - Standard HTTP endpoints timeout on cloud gateways (e.g. Vercel 10s limit, Cloud Run 60s proxy caps).
  - WebSockets introduce firewall and proxy disconnection issues in serverless runtimes.
  - Job polling over lightweight HTTP GET (`/api/providers/sync/status/:jobId`) is resilient to transient network blips and works across all platforms.
- **Alternatives Considered**: 
  - *Server-Sent Events (SSE)*: Good for continuous streaming, but proxy buffering on certain cloud reverse proxies can stall event delivery.
  - *Single Long HTTP POST*: Frequently aborted by browser `fetch` timeouts or intermediate load balancers.

### Decision 2: Dual-Tier Storage (In-Memory + Auto-Routing Disk)
- **Chosen Approach**: Dual-Tier SQLite (`sql.js`) with dynamic path resolution.
- **Why**:
  - Writing directly to `./data/*.sqlite` fails on serverless platforms (Vercel) with `EROFS: read-only file system`.
  - Checking `fs.access` with fallback to `/tmp/*.sqlite` and in-memory export guarantees persistence wherever possible and crash-free execution in read-only environments.
- **Alternatives Considered**: 
  - *In-memory only*: Loses all state on every cold start.
  - *External Turso only*: Fails if user credentials or remote network latency fluctuates.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        BROWSER CLIENT (React / Vite)                  │
│                                                                        │
│   SettingsModal                FixturesList       PredictionHistory    │
│         │                            ▲                     ▲           │
│         ▼ (POST /sync/start)         │ (GET /fixtures)     │ (GET /hist)
│   SyncJobManager ──(poll /status)────┼─────────────────────┘           │
└─────────┼────────────────────────────┼─────────────────────────────────┘
          │ (HTTP 202 + Job ID)        │
          ▼                            ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        EXPRESS APPLICATION LAYER                       │
│                                                                        │
│  providersRouter.ts                                                    │
│    ├── POST /sync/start     ──> Launches detached Async Background Task │
│    ├── GET  /sync/status/:id ──> Reads in-memory JobState store        │
│    └── POST /sync/cancel/:id ──> Aborts running workers               │
│                                                                        │
│  SyncJobRunner (Worker Logic)                                          │
│    ├── Phase 1: Database Purge (clearAllData & clearAll)               │
│    ├── Phase 2: Ingest Historical Feeds (Parallel Scraper + Fallback)  │
│    ├── Phase 3: Upcoming Feeds & Live In-Play Ingestion               │
│    ├── Phase 4: Batch Poisson & Dixon-Coles Prediction Pipeline       │
│    └── Phase 5: Atomic SQLite Export & Turso Sync                      │
└─────────┼──────────────────────────────────────────────────────────────┘
          ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        PERSISTENCE & REPLICATION                       │
│                                                                        │
│  Dual-Tier SQLite Engine:                                              │
│    Primary:   ./data/predictions.sqlite (Persistent local volume)      │
│    Fallback:  /tmp/predictions.sqlite   (Serverless ephemeral volume)  │
│    Emergency: sql.js In-Memory Store     (Zero-filesystem fallback)    │
│    Replication: Turso LibSQL (Non-blocking background sync)            │
└────────────────────────────────────────────────────────────────────────┘
```

### Async Job Lifecycle & State Model

```typescript
interface SyncJobState {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number; // 0 to 100
  currentStep: string;
  totalSteps: number;
  completedSteps: number;
  stats: {
    purgedRecords: number;
    scrapedMatches: number;
    upcomingFixtures: number;
    predictionsGenerated: number;
  };
  error?: string;
  startTime: number;
  endTime?: number;
}
```

### Phased Execution Steps
1. **Step 1 - Purge & Schema Verification**:
   - Truncates SQLite tables (`upcoming_predictions`, `live_predictions`, `historical_predictions`, `raw_feed_data`).
   - Ensures column definitions are strictly snake_case (`league_name`) with auto-healing `ALTER TABLE` guards.
2. **Step 2 - Concurrent Scraper Ingestion**:
   - Executes parallel `fetch` calls for 8 historical feed offsets with 4-second timeouts.
   - Concurrently fetches top tournament results using `Promise.allSettled`.
   - On error or block, seamlessly seeds verified fallback datasets to ensure database is always populated.
3. **Step 3 - High-Throughput Prediction Modeling**:
   - Pre-indexes historical matches by league code for $O(1)$ lookups.
   - Calculates dynamic rest days, home advantages, and Dixon-Coles expected values.
   - Saves predictions in batched SQLite transactions (100 fixtures per commit).
4. **Step 4 - Dual-Tier Persistence**:
   - Exports the WASM binary buffer to `./data/*.sqlite` or `/tmp/*.sqlite`.
   - Updates JobState to `COMPLETED` with detailed summary metrics.
