# Implementation Plan: Fix Fixtures Loading Pipeline & Event-Loop Lock

Deep technical root-cause analysis of why fixtures were failing to load on the application, accompanied by a targeted 4-phase resolution plan to restore immediate, sub-second fixture rendering.

---

## 1. Deep Root Cause Analysis

Through live process profiling, Node.js inspector stack traces, and code path analysis, we identified the exact cause preventing fixtures from loading:

### Primary Cause: Main Node.js Event Loop Freeze & Memory Exhaustion
1. **15-Second Polling Loop**: In `src/App.tsx` (lines 143–150), on application mount `fetchLiveScores()` runs and schedules a recurring 15-second interval:
   ```ts
   const interval = setInterval(fetchLiveScores, 15000);
   ```
2. **Inner Synchronous Loop**: `fetchLiveScores()` calls `/api/providers/live-scores`, which triggers `flashscoreScraperService.getLiveScores()`. In `src/services/flashscoreScraperService.ts` (lines 267–273):
   ```ts
   const rawMatches = parseFeedText(feedText); // ~2,200 matches
   const liveMatches = rawMatches.filter((m) => {
     db.saveRawFeed(m.matchId, feedPath, feedText); // BUG: called 2,200 times!
     if (m.statusCode !== '2') return false;
     ...
   });
   ```
3. **Synchronous Full Database Export**: In `src/core/db.ts` (line 1340), `saveRawFeed` executes:
   ```ts
   this.saveToDisk();
   ```
   `saveToDisk()` executes `this.db.export()`, which serializes the **entire 50MB+ SQLite database in memory into a binary buffer** and writes it synchronously to disk (`fs.writeFileSync`).
4. **Catastrophic Impact**:
   - Calling `saveToDisk()` 2,200 times in a synchronous loop forced over **100 GB** of binary database exports in the main JavaScript thread.
   - The Node.js server process was locked at **70–100% CPU** for over 11 minutes with memory bloating to **~1 GB RSS**.
   - Because Node.js is single-threaded, all incoming HTTP requests—specifically `GET /api/fixtures`—were queued behind thousands of synchronous disk writes and timed out after 45 seconds.
   - The frontend displayed an endless loading state or an empty list because the API never responded.

### Secondary Cause: Redundant Raw Feed Persistence
- `fetchAndPersistRawFeed(feedPath)` already persisted the raw feed text once per endpoint.
- Re-saving the identical 300KB string for every individual match ID in the 2,200-match array bloated the SQLite database unnecessarily.

---

## 2. Proposed Fix Plan

### Phase 1: Eliminate the Synchronous Loop in `flashscoreScraperService.ts`
- Remove `db.saveRawFeed(m.matchId, feedPath, feedText)` from inside the `filter()` loop in `getLiveScores()`.
- Filter live in-play matches purely in memory and map them directly to `LiveScore` objects.

### Phase 2: Safeguard SQLite `saveToDisk` in `src/core/db.ts`
- Remove `this.saveToDisk()` from `saveRawFeed` and `saveMatchStatistics`.
- Restrict `this.saveToDisk()` strictly to major batch write completions (e.g. `saveUpcomingFixtures`, `saveSettings`, database resets).

### Phase 3: Dev Server Process Reset & Ingestion Verification
- Restart the Node dev server process to release the runaway memory bloat and unblock the event loop.
- Test `GET /api/fixtures` and `GET /api/providers/live-scores` directly to ensure sub-50ms HTTP response times.

### Phase 4: Full App Verification
- Run `lint_applet` and `compile_applet` to confirm clean compilation and zero TypeScript regressions.
- Verify in-app UI rendering for all fixtures across Today, Tomorrow, and Next 3 Days views.

---

## 3. User Review Request
Please review this implementation plan and click **Proceed** to execute the fix.
