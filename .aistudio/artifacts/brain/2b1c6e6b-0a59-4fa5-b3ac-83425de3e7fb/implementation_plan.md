# Implementation Plan: Improving Data Parsing Reliability to >90% Availability

## Objective
The prediction engine currently skips fixtures with insufficient data (<90% availability score). To increase this percentage, we must extract more granular data points from the raw feed and ensure they are persisted in the database.

## Phase 1: Diagnostic Audit
- **Examine Raw Feed Content**: Sample 5-10 records from the `raw_feed_data` table to identify under-utilized data points (e.g., hidden team stats, specific market odds, recent form data not currently parsed).
- **Identify Gaps**: Compare current parsed fields in `feedParser.ts` against the raw feed structure to identify fields that should be added to the `Fixture` interface.

## Phase 2: Enhanced Parsing & Mapping
- **Update `feedParser.ts`**: Expand the parsing regex/logic to extract identified missing data points.
- **Update `flashscoreScraperService.ts`**: Update the mapping logic to ensure newly parsed data is correctly injected into the `Fixture` and `HistoricalMatch` objects.

## Phase 3: Engine Integration & Weighting
- **Adjust `calculateDataAvailability` in `serverEngine.ts`**:
  - Incorporate the new data points into the availability score.
  - Recalibrate the scoring weights so that previously "skipped" matches with sufficient new data points now cross the 90% threshold.
- **Verification**: Run a batch of fixtures through the updated parser and availability checker to verify improved eligibility rates.

## Success Criteria
- Fixture eligibility rate (matches passing >90% check) increases significantly.
- No regression in existing data integrity.
- Database records contain the additional enriched data.
