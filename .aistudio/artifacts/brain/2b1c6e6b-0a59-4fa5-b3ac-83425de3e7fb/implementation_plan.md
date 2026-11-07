# Implementation Plan - Full Sync Resilience & Historical Raw Feed Extraction

Deep architectural plan to ensure 100% error-free execution of the Full Synchronization workflow (`syncJobService` and `flashscoreScraperService`) and direct extraction of historical match data from multi-day raw feeds while strictly updating existing UI views.

## User Review & Critical Decisions

> [!IMPORTANT]
> The user confirmed the following requirements:
> - **UI Discipline**: **Strictly update existing UI components—never create new UI views, panels, or components.**
> - **Failure Handling**: Skip failing leagues or archive endpoints automatically with clean log warnings and continue sync seamlessly for all remaining leagues.
> - **Historical Extraction**: Extract and persist completed matches directly from multi-day raw feeds (`f_1_-1` through `f_1_-7` and `df_hh_1`) into the `historical_matches` database table.

- **Confirmed Decision 1**: Non-blocking step execution with per-league circuit breakers so Step 3 never halts or times out the worker job.
- **Confirmed Decision 2**: Multi-day raw feed parser automatically extracts historical results into SQLite/Turso database without external browser dependencies.
- **Confirmed Decision 3**: Existing sync progress controls, modal, and engine panels (`src/components/SyncProgressModal.tsx`, `src/components/DataProvidersTab.tsx`, `src/components/FixturesList.tsx`) will be updated in-place without creating any new UI components.

---

## 1. Overview & Core Concept

- **What It Does**: Hardens the 6-step full synchronization worker job (`syncJobService`) so it executes to 100% completion without hanging or aborting at Step 3. Adds direct parsing of historical match records from Flashscore raw feed sections (`AA÷...` with `AB÷3` or finished score flags) straight into the database.
- **Target Audience / Persona**: Users, administrators, and automated background sync jobs relying on robust football data sync and prediction calculations.
- **Key Value**: Guarantees zero-failure sync jobs, automatic fault tolerance when remote league archives are unreachable, and richer historical match depth extracted directly from raw feed payloads, built cleanly on top of the existing user interface.

---

## 2. User Experience & Visual Design (Existing UI In-Place Updates)

- **Existing UI Modifications Only**:
  1. **Sync Progress Modal (`src/components/SyncProgressModal.tsx`)**: Update existing progress bar, step titles, and error state displays in-place to render fault-tolerant step notifications (e.g. `Step 3/6: Processing raw feeds & archive feeds (skipped 1 unreachable league)...`).
  2. **Data Providers Tab (`src/components/DataProvidersTab.tsx`)**: Update existing provider status, sync action buttons, and live log stream indicators.
  3. **Fixtures List & Filter Bar (`src/components/FixturesList.tsx`)**: Ensure existing calendar date pills, league filters, and prediction badges reflect newly synchronized historical & upcoming matches cleanly.

- **Visual Identity & Theme**:
  - Maintain the existing dark slate visual style (`bg-slate-900`, `border-slate-800`).
  - Use `Plus Jakarta Sans` for typography with `font-mono tabular-nums` for progress percentages, match counts, and timestamps.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Isolated Per-League Abort Controllers & Failure Suppression**
  - *Chosen Approach*: Wrap each league archive scrape in an isolated `try/catch` block with a 5-second `AbortController` timeout and suppress non-critical network failures.
  - *Why*: Prevents network stalls or Cloudflare blocks on a single league from blocking the worker loop or throwing uncaught step 3 exceptions.

- **Decision 2: Direct Raw Feed Historical Match Ingestion**
  - *Chosen Approach*: Expand `parseFeedText` and `syncHistoricalData` to parse completed matches (`m.statusCode === '3'` or `m.homeScore !== undefined`) from multi-day past raw feeds (`f_1_-1_3_en_1` through `f_1_-7_3_en_1`).
  - *Why*: Raw feeds contain real historical match records with exact timestamps, teams, scores, and statistics without needing headless browser DOM rendering.

- **Decision 3: Zero New UI Components**
  - *Chosen Approach*: Refactor backend services and update pre-existing UI files in-place without adding any new file components to `src/components/`.
  - *Why*: Respects user's strict UI discipline requirement.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            SYNC JOB CONTROLLER                              │
│                          (syncJobService.ts)                                │
└──────────────────────┬──────────────────────────────────────────────────────┘
                       │
       ┌───────────────┴───────────────┐
       ▼                               ▼
┌──────────────┐              ┌──────────────────────────┐
│ STEP 1 & 2   │              │ STEP 3: HISTORICAL SYNC  │
│ Purge & DB   │              │ (flashscoreScraperService│
│ Reconcile    │              └────────────┬─────────────┘
└──────────────┘                           │
                                           ├──────────────────────────┐
                                           ▼                          ▼
                              ┌────────────────────────┐  ┌──────────────────────┐
                              │ Multi-Day Raw Feeds    │  │ Archive Page Crawl   │
                              │ (f_1_-1 to f_1_-7)     │  │ (5s Timeout Isolation│
                              └────────────┬───────────┘  └──────────┬───────────┘
                                           │                         │ (Skip on Error)
                                           ▼                         ▼
                              ┌──────────────────────────────────────────────────┐
                              │      HISTORICAL DATABASE (historical_matches)    │
                              └────────────────────┬─────────────────────────────┘
                                                   │
                                                   ▼
                              ┌──────────────────────────────────────────────────┐
                              │ STEP 4-6: Upcoming, 5-Pillar Predictions & H2H   │
                              └────────────────────┬─────────────────────────────┘
                                                   │
                                                   ▼
                              ┌──────────────────────────────────────────────────┐
                              │     EXISTING UI UPDATES (SyncProgressModal.tsx,  │
                              │       DataProvidersTab.tsx, FixturesList.tsx)    │
                              └──────────────────────────────────────────────────┘
```

### Component & File Modification Plan (Existing Files Only)

1. **`src/services/flashscoreScraperService.ts`**:
   - Add tight 5-second timeouts and `try/catch` wrappers around all archive requests in `scrapeLeagueArchive`.
   - Update `syncHistoricalData` to parse past days' raw feeds (`f_1_-1` to `f_1_-7`) directly into `HistoricalMatch[]` objects and store them in `db.insertHistoricalMatches()`.
   - Ensure Playwright fallback handles missing browser gracefully without throwing uncaught promises.

2. **`src/services/syncJobService.ts`**:
   - Wrap Step 3 execution in robust exception handling so if `syncHistoricalData` returns early or encounters partial warnings, the job updates progress and continues directly to Step 4.

3. **`src/core/feedParser.ts`**:
   - Ensure `parseFeedText` extracts all completed match section attributes (`AA÷matchId`, `AD÷timestamp`, `AE÷homeTeam`, `AF÷awayTeam`, `AG÷homeScore`, `AH÷awayScore`, `AB÷3`).

4. **`src/components/SyncProgressModal.tsx` & `src/components/DataProvidersTab.tsx`**:
   - Update existing rendering logic to display granular non-blocking step logs and skip warnings cleanly within the existing modal and tab views.

---

## Pre-Execution Verification Plan

1. Co-execute `compile_applet` and `lint_applet` to verify syntax and type safety.
2. Restart dev server (`restart_dev_server`) and execute a test full sync job via `/api/providers/sync/start`.
3. Poll `/api/providers/sync/status/:jobId` to confirm job transitions smoothly from Step 1 through Step 6 to `COMPLETED` at 100% progress.
