# Implementation Plan - Fixing Prediction Persistence in SQLite

## Problem Statement
When manual "Update Predictions" is triggered in settings or during sync workflows, some upcoming fixture predictions may fail to save properly to SQLite or are incorrectly filtered out by the 90% Data Availability gatekeeper.

## Root Causes Identified
1. **Data Availability Gatekeeper Threshold**: Matches missing certain historical depth or market odds attributes score below 90% and are skipped from prediction and persistence.
2. **Database Transaction / Schema Drift**: Missing columns or constraint conflicts during bulk `INSERT OR REPLACE` into `upcoming_predictions`.
3. **Swallowed Catch Blocks**: Occasional errors during chunk saving were logged to console/terminal but did not properly bubble up or surface helpful troubleshooting diagnostics in the UI or logs.

## Proposed Changes

### 1. Robustness & Diagnostics in `PredictionsDB` (`src/core/predictionsDb.ts`)
- Enhance `savePredictions` with detailed column logging and per-row transaction fallbacks if batch insertion encounters issues.
- Validate JSON serialization of `full_fixture_json`.

### 2. Data Availability Gatekeeper Tuning (`src/core/serverEngine.ts`)
- Adjust threshold and graceful fallbacks in `calculateDataAvailability` so that valid upcoming fixtures with baseline odds or league averages successfully qualify for predictions without being overly restrictive.

### 3. Verification
- Test manual "Update Predictions" in Settings and verify successful persistence and log output in the Terminal modal.
