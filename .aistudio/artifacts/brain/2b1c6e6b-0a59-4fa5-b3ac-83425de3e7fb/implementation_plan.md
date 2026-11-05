# Read-Only Football Prediction Model & Isolated Manual Calculation Architecture

Transitioning the application to a **strict static read-only data model** for predictions. All dynamic prediction calculations, auto-generations, and on-demand adjustments across client-side components and standard server API routes are completely removed. Prediction generation is strictly isolated to a manual update trigger in the Settings modal with a 90% Data Availability Gatekeeper.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions were confirmed in Phase 1 interactive clarification:

- **Confirmed Decision 1 (Upcoming Matches Below 90% Threshold)**: Matches that do not meet the 90% data availability requirement will be skipped during prediction updates. On the frontend, prediction tabs and value badges are hidden, displaying only the match schedule, teams, and scores.
- **Confirmed Decision 2 (Live Matches with Stored Predictions)**: Live matches with pre-existing pre-match predictions stored in the database will display the original prediction alongside the live score. If no pre-match prediction exists, the UI falls back gracefully to showing only the live score without triggering dynamic calculation.
- **Confirmed Decision 3 (Manual Update Location)**: The Manual Update trigger remains strictly isolated inside the Settings modal under the "Predictions" tab.

---

## 1. Overview & Core Concept

- **What It Does**: Enforces an immutable read-only pipeline where standard API endpoints (`GET /api/fixtures`, `GET /api/fixtures/live`, `GET /api/fixtures/history`) purely query and serve pre-calculated static records from the Turso SQLite database.
- **Key Value**: Zero API latency delays caused by unexpected background calculations, zero race conditions, predictable database state, and guaranteed visual consistency across all client views.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Upcoming Matches Feed**: User views upcoming fixtures. Matches with stored predictions display prediction cards, probability bars, and +EV market badges. Matches without stored predictions (skipped due to <90% data) display clean schedule and odds information without broken prediction tabs.
  2. **Live Matches View**: User opens the Live Scores view. Live scores poll live provider feeds. If a pre-stored prediction exists in `predictionsDb` for that match, it displays the pre-game 5-Pillar breakdown alongside live match minutes and score. If absent, it renders a clean live match scoreboard without error toasts or dynamic calculation spinners.
  3. **Isolated Manual Recalculation**: User opens `Settings -> Predictions` tab and clicks "Update Predictions". The isolated backend worker reads raw DB fixtures, applies the 90% Data Gatekeeper, recalculates Poisson models in chunks, and updates the static database tables with real-time UI percentage and counter updates.

- **Visual Identity & Theme**:
  - Dark mode aesthetic (`#09090B`, `#121216`) with high-contrast `#CCFF00` accent styling.
  - Tabular numerals (`font-mono tabular-nums`) for all scores, probabilities, xG values, and percentages.
  - Unboxed metadata with clean inline separators (`·`).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Complete Removal of Dynamic Compute on API Endpoints**
  - *Chosen Approach*: Strip out all `ServerEngine.predictAndStoreLiveFixtures` and `ServerPredictionGeneratorService` fallback generation calls from standard API handlers.
  - *Why*: Eliminates unexpected server latency, 5-minute timeouts, and CPU spikes during standard user navigation.
  - *Alternatives Considered*: Background lazy calculation on cache miss. Rejected because it violates the strict read-only requirement.

- **Decision 2: 90% Data Availability Gatekeeper**
  - *Chosen Approach*: Evaluates matches against 5 analytical dimensions (core identification 20%, home depth 25%, away depth 25%, league baselines 15%, market/H2H 15%). Minimum score threshold: **0.90 (90%)**.
  - *Why*: Ensures high mathematical confidence for generated Poisson predictions and avoids hallucinated or weak predictions on sparse records.

---

## 4. Technical Architecture & Data Strategy

### Refactored System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FRONTLINE READ PIPELINE                          │
│               (Client App / Dashboard / Live Score Views)               │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                        GET /api/fixtures or /live
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Express Router Layer                           │
│                (src/routes/fixturesRouter.ts - Pure Read)               │
├─────────────────────────────────────────────────────────────────────────┤
│  - NO dynamic compute or generator invocations                          │
│  - Query Turso SQLite (`predictionsDb` / `upcoming_fixtures`)           │
│  - Live matches: perform DB lookup for existing pre-match prediction    │
│  - Return static JSON payload to client                                 │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       ISOLATED MANUAL UPDATE SERVICE                    │
│                 (Settings Modal -> Predictions Tab Trigger)             │
├─────────────────────────────────────────────────────────────────────────┤
│  POST /api/settings/update-predictions -> SyncJobService.executeJob    │
│  1. Read raw fixtures exclusively from Turso DB                         │
│  2. Evaluate 90% Data Availability Gatekeeper (Score >= 0.90)           │
│  3. Pass eligible fixtures through 5-Pillar Poisson Engine             │
│  4. Save finalized static records into `upcoming_predictions` table     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technical Implementation Plan

1. **`src/routes/fixturesRouter.ts`**:
   - Remove `ServerPredictionGeneratorService.generateAndStorePredictionsFromDb` and `ServerEngine.predictAndStoreLiveFixtures` calls.
   - For `GET /api/fixtures`: Read directly from `predictionsDb.getPredictions()`.
   - For `GET /api/fixtures/live`: Fetch live scores from provider, check `predictionsDb.getPredictionById(fixtureId)`. If found, attach `prediction` object; if not, return live match without `prediction`.

2. **`src/core/serverEngine.ts`**:
   - Update `calculateDataAvailability` threshold from 0.95 to **0.90 (90%)**.
   - Ensure `recalculateUpcomingFromDbInChunks` uses `availability.score >= 0.90`.
   - Remove auto-execution calls from standard engine helpers.

3. **`src/services/syncJobService.ts`**:
   - Maintain `executePredictionJob` as the single isolated service for manual prediction recalculations.
   - Read strictly from Turso DB (`db.getUpcomingFixtures()`), filter by $\ge 90\%$ data completeness, compute predictions in chunks of 50, and write static records to `upcoming_predictions`.

4. **Frontend UI Components (`FixtureCard.tsx`, `MatchInspectorModal.tsx`, `SettingsModal.tsx`)**:
   - Ensure components check `if (fixture.prediction)` before rendering prediction tabs, xG meters, or value bet badges.
   - If `fixture.prediction` is null or undefined, gracefully hide prediction sections and render schedule, team names, odds, and live scores.
   - Settings modal Predictions tab copy updated to highlight the 90% Data Availability threshold.
