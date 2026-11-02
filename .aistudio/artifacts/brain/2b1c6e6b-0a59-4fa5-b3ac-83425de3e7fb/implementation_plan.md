# On-Demand Scraper & Raw Feed Fallback Engine Fix

Eliminates the "no raw feed found" warning and error state when inspecting matches, statistics, or H2H details by introducing an automated multi-tier lookup pipeline with active Flashscore CDN feed scraping and database caching.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed based on user clarification:

- **Confirmed Decision 1 (Active Scraper Fetch)**: When a raw feed is absent from local memory or database storage, `OnDemandParser` and match detail endpoints will actively trigger a live feed fetch from Flashscore via Ninja CDN endpoints with mirror failover and circuit breaker protection.
- **Confirmed Decision 2 (Multi-Tier Persistence Lookup)**: Implemented a resilient 3-stage lookup: Memory Cache -> Turso Cloud DB (`raw_feed_data` table) -> Live CDN Scraper fallback.
- **Confirmed Decision 3 (Canonical Match ID Normalization)**: Standardized ID resolution by stripping all lookup prefixes (`fs_`, `hist_`, `scraped_`) before executing database and feed queries.

---

## 1. Overview & Core Concept

- **What It Does**: Resolves raw feed missing errors when users open match details, inspect H2H records, view club form, or analyze on-demand statistics. Missing feeds are scraped dynamically on demand, stored in the SQLite/Turso database, and returned without breaking UI flow or logging server warnings.
- **Target Audience / Persona**: Football analysts and bettor users reviewing individual match breakdowns, H2H team records, and statistical trends.
- **Key Value**: Zero failed detail lookups, guaranteed stats and H2H availability, and automatic local feed caching to optimize future feed queries.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. User selects any fixture card in the main feed or searches for a historical/upcoming match.
  2. Match Detail inspector modal loads.
  3. If the match raw feed is present in memory, it parses immediately (<15ms).
  4. If missing from memory, it queries Turso Cloud DB (`raw_feed_data`).
  5. If missing from Turso, `OnDemandParser` triggers an active Flashscore CDN request for `df_m_1_{matchId}` or `df_hh_1_{matchId}` across rotated Ninja CDN endpoints (`46.flashscore.ninja`, `1.flashscore.ninja`, `2.flashscore.ninja`).
  6. Scraped feed is persisted to DB and memory, and match statistics/H2H are instantly populated in the UI without error toasts or blank states.

- **Visual Identity & Theme**:
  - *Aesthetic*: Dark mode posture with dark neutral backgrounds (`#09090B`, `#121216`), bright neon accent `#CCFF00`, crisp typography, and MUI/Lucide icons.
  - *Interactive Feedback*: Smooth loading state for match detail stats while on-demand fetch completes, followed by instantaneous rendering.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Active Fallback vs Static Error Message**
  - *Chosen Approach*: On-demand live feed scraping upon cache miss.
  - *Why*: Guarantees every match detail request succeeds even if the match wasn't included in the initial bulk background sync batch.
  - *Alternatives Considered*: Static error message or empty placeholder. Rejected because it degraded user experience when inspecting niche or global matches.

- **Decision 2: Multilevel Raw Feed Lookup (`Memory -> Turso -> Scraper`)**
  - *Chosen Approach*: Synchronously check in-memory Map; if absent, asynchronously query Turso SQLite `raw_feed_data`; if absent, trigger `fetchFlashscoreFeed` with circuit breaker backoff.
  - *Why*: Minimizes network overhead for repeatedly viewed matches while preserving 100% data coverage.

---

## 4. Technical Architecture & Data Strategy

### System Component & Lookup Sequence Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Match Detail Request                            │
│                  (GET /api/fixtures/:id/detail or h2h)                 │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Canonical ID Resolution                        │
│                   cleanId = id.replace(/^(fs_|hist_)/, '')             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Stage 1: Memory Lookup                           │
│                     db.getRawFeed(cleanId)                             │
└───────────────┬────────────────────────────────────────┬───────────────┘
                │ Found                                  │ Miss
                ▼                                        ▼
┌──────────────────────────────┐        ┌────────────────────────────────┐
│  Parse & Return Match Feed   │        │     Stage 2: Turso DB Lookup   │
└──────────────────────────────┘        │ SELECT raw_text FROM raw_feed… │
                                        └───────┬────────────────┬───────┘
                                                │ Found          │ Miss
                                                ▼                ▼
                                 ┌────────────────────┐ ┌────────────────┐
                                 │ Save to Memory     │ │Stage 3: Scraper│
                                 │ & Parse Match Feed │ │Fetch Flashscore│
                                 └────────────────────┘ │CDN (Ninja)     │
                                                        └───────┬────────┘
                                                                │
                                                                ▼
                                                        ┌────────────────┐
                                                        │Persist to DB & │
                                                        │Memory Cache    │
                                                        └────────────────┘
```

### Implementation Sequence

1. **`src/core/db.ts`**:
   - Upgrade `getRawFeed(fixtureId)` to query Turso `raw_feed_data` table when an in-memory miss occurs.
   - Standardize canonical ID searching in `rawFeedsMemory` and `raw_feed_data`.

2. **`src/services/flashscoreScraperService.ts`**:
   - Implement `fetchMatchRawFeed(fixtureId: string)` with rotated Ninja CDN endpoints and circuit breaker retry backoff.
   - Automatically persist newly scraped feeds into `db.saveRawFeedData`.

3. **`src/core/onDemandParser.ts`**:
   - Update `getParsedMatch(fixtureId)` and `getParsedH2H(fixtureId)` to perform the multi-tier fetch fallback (`Memory -> Turso DB -> ScraperService`).
   - Suppress warning logs when fallback fetching successfully resolves the feed.

4. **`src/routes/fixturesRouter.ts`**:
   - Ensure `fixturesRouter.get('/:id')` and `fixturesRouter.get('/:id/h2h')` call the upgraded `OnDemandParser` handlers asynchronously.
