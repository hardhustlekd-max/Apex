# System-Wide Standardized Date & Time Engine

Standardize date parsing, formatting, storage, and match kick-off evaluation across server scrapers, database persistence layers, and client UI components using the **Flashscore Date/Time Standard** exclusively, eliminating browser-based clock dependencies, local client timezone shifts, and environment-dependent date discrepancies.

## User Review & Critical Decisions

> [!IMPORTANT]
> The plan has been revised per your instructions to strictly utilize Flashscore data and time standards, completely bypassing browser-based clocks and local client timing.

- **Confirmed Decision 1 (Flashscore Data & Storage Standard)**: Scrapers, database persistence, predictions stores, and backend engines will strictly enforce Flashscore standardized date (`YYYY-MM-DD`) and 24-hour time (`HH:mm`) format (or raw Flashscore Unix timestamp epoch where provided by feeds), storing normalized timestamps uniformly across all deployments.
- **Confirmed Decision 2 (Zero Browser Clock Dependency for Kick-off)**: Kick-off status evaluation (`hasMatchStarted`) will operate strictly on Flashscore feed timestamps and Flashscore/UTC epoch time, ignoring browser local clocks, system timezone overrides, or client-side `new Date()` locale shifts.
- **Confirmed Decision 3 (UI Parity with Raw Feeds)**: Frontend components (Matches Grid, Historical Evaluation, Predictions View, Poisson Matrix) will display match dates and times directly in Flashscore standard time format, guaranteeing 1:1 visual parity with Flashscore feeds across all user environments.

---

## 1. Overview & Core Concept

### What It Does
This feature establishes a centralized, resilient **Flashscore Date & Time Core Module** (`dateUtils.ts`). It guarantees that match kick-off calculations, date queries, auto-migrations of finished games, and historical prediction evaluations operate on Flashscore standardized time specs across all environments (Vercel, Node server, client UI) with zero browser clock interference.

### Target Audience
Analytics engine users and automated predictions pipelines requiring strict alignment with Flashscore match schedules and 1:1 prediction evaluation accuracy.

### Key Value
- **Zero Browser Clock Dependency**: Prevents false "upcoming" or "finished" match states caused by incorrect local client clocks or browser timezone settings.
- **1:1 Flashscore Feed Parity**: Eliminates time shift confusion between raw scraped feeds, predictions DB entries, and frontend scoreboards.
- **Standardized Database Schema**: Ensures historical predictions query matching (`YYYY-MM-DD`) operates smoothly across every server deployment.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Historical Prediction Evaluation View**:
   - Queries `historical_predictions` DB strictly by Flashscore normalized date `YYYY-MM-DD`.
   - Displays evaluation results matching Flashscore match dates with 100% accuracy.
2. **Upcoming & Live Matches List**:
   - Determines match state (`UPCOMING`, `LIVE`, `FINISHED`) using Flashscore kick-off epoch timestamps without consulting browser local time.
   - Finished matches automatically migrate to `historical_predictions` when Flashscore feed marks them complete or kick-off timestamp passes Flashscore UTC threshold.
3. **Poisson & Analysis Views**:
   - Renders match schedule times in clean `HH:mm` Flashscore standard notation with monospace tabular alignment (`font-mono tabular-nums`).

### Visual Identity & Theme
- **Style**: Dark-mode sports analytics interface with `#CCFF00` (Lime) accent highlights.
- **Typography**: `Plus Jakarta Sans` for titles, `JetBrains Mono` / `tabular-nums` for scorelines and Flashscore timestamps.
- **Metadata Rule**: Clean text separators (`·` / `/`) with zero static pill enclosures.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Pure Flashscore Time Standard Across All Layers
- **Chosen Approach**: Parse and store all scraped match dates and kick-off times in Flashscore standard notation (`YYYY-MM-DD`, `HH:mm`, or Flashscore Unix timestamp). Frontend views render the exact Flashscore time string.
- **Why**: Eliminates confusion caused by client browsers converting kick-off times into different local timezones.
- **Alternatives Considered**: Converting Flashscore times to user local browser timezone, which caused date mismatch bugs when users viewed matches spanning midnight UTC.

### Decision 2: Browser-Independent Kick-Off Evaluation Engine
- **Chosen Approach**: Calculate match elapsed state using Flashscore kick-off Unix timestamp parsed from feed metadata or standard UTC epoch calculation (`Date.UTC(...)`), compared against server-synchronized UTC timestamp. Client browser local clock offsets are ignored.
- **Why**: Guarantees consistent match status detection regardless of whether a user's phone or computer clock is fast, slow, or set to a different timezone.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Flashscore Standardized Date & Time Pipeline                │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                   Flashscore Scraper & Parser Service                     │
 │  Extracts match date/time -> Normalizes to Flashscore standard            │
 │  (YYYY-MM-DD / HH:mm / Unix Kickoff Epoch)                                │
 └───────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                          PredictionsDB / SQLite DB                         │
 │  Stores date: 'YYYY-MM-DD', time: 'HH:mm', kickoff_timestamp: Unix epoch  │
 └───────────────────────────────────────────────────────────────────────────┘
                                       │
                        ┌──────────────┴──────────────┐
                        ▼                             ▼
 ┌─────────────────────────────────────────┐ ┌──────────────────────────────┐
 │     Historical Evaluation DB Query      │ │ Flashscore Kickoff Engine    │
 │ (Matches predictions on date YYYY-MM-DD │ │ (Evaluates kickoff state     │
 │  against fixture results)               │ │  without browser clock drift)│
 └─────────────────────────────────────────┘ └──────────────────────────────┘
                        │                             │
                        └──────────────┬──────────────┘
                                       ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                           Unified Frontend UI                             │
 │ (Renders Flashscore standard time directly with tabular numerals)         │
 └───────────────────────────────────────────────────────────────────────────┘
```

### Proposed Code Refinements Across System
1. **`src/core/dateUtils.ts`**:
   - Update `hasMatchStarted` and `normalizeDateStr` / `normalizeTimeStr` to strictly process Flashscore feed date/time formats and Flashscore Unix timestamps.
   - Strip out browser locale conversions to preserve pure Flashscore standard timestamps.
2. **`src/services/flashscoreScraperService.ts` & `src/core/onDemandParser.ts`**:
   - Ensure all scraped fixture items carry normalized Flashscore date (`YYYY-MM-DD`) and time (`HH:mm`) values.
3. **`src/core/predictionsDb.ts` & `src/routes/fixturesRouter.ts`**:
   - Ensure match reconciliation and migration to `historical_predictions` rely strictly on Flashscore kick-off status and standard date matching.
4. **UI Components (`MatchesView`, `HistoricalEvaluation`, `PoissonMatrixView`)**:
   - Display match times directly from Flashscore standard formatting using `font-mono tabular-nums`.
