# Implementation Plan: Fix H2H and Standings Loading Issues

Root-cause analysis of why Head-to-Head (H2H) and Standings data are not loading correctly, and the proposed implementation plan.

---

## 1. Root Cause Analysis

### Standings Data Loading Failure
- **API Endpoint Mismatch**: The frontend component `src/components/LeagueStandings.tsx` is attempting to fetch standings from `/api/standings/${leagueCode}`. However, in `src/app.ts`, the `fixturesRouter` is mounted at `/api/fixtures`, and the route in `fixturesRouter.ts` is defined as `/standings/:league`. Therefore, the correct endpoint is `/api/fixtures/standings/:league`. The current frontend request is resulting in a 404 Not Found.
- **League Mapping Deficiency**: The `flashscoreScraperService.getLeagueStandings` uses a hardcoded `urlMap`. Leagues not present in this map result in empty standings data, which the UI does not handle gracefully.

### H2H Data Loading Failure (Perceived)
- **UI State Handling**: While the API endpoint `/api/fixtures/:id/h2h` works, the frontend `MatchDetailModal.tsx` does not appear to handle cases where the API returns `h2h: null` or empty data, resulting in either a blank UI state or an unhelpful generic error.
- **Data Availability**: For newer or minor leagues, H2H data might not be scraped yet. The current implementation relies on real-time scraping rather than robust fallback or clear UI feedback for missing data.

---

## 2. Proposed Fix Plan

### Phase 1: Fix API Route for Standings
- Update `src/components/LeagueStandings.tsx` to fetch from the correct path: `/api/fixtures/standings/${encodeURIComponent(cleanCode)}`.

### Phase 2: Improve Standings Scraping Resilience
- Update `getLeagueStandings` in `src/services/flashscoreScraperService.ts` to implement a fallback for leagues not in `urlMap`. The scraper will attempt to dynamically determine the standings URL path based on the league name if not explicitly mapped.

### Phase 3: Enhance H2H UI Resilience
- Update `src/components/MatchDetailModal.tsx` to explicitly handle null/empty H2H data responses, providing a user-friendly "Head-to-Head data not available for this match" notification instead of a silent failure.

### Phase 4: Full App Verification
- Verify loading of both H2H and Standings data in the app.
- Ensure linter and compiler pass with zero regressions.

---

## 3. User Review Request
Please review this implementation plan and click **Proceed** to execute the fix.
