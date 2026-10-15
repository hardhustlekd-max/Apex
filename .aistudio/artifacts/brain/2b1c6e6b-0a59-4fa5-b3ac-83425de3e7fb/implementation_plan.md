# Revised Implementation Plan: Hard Reset & Phased Manual Sync

Revise the database reset functionality to perform a comprehensive "factory reset" of the application, and implement a strictly manual, phased, multi-step synchronization workflow with explicit progress reporting.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Hard Reset**: Resetting triggers a full clearing of SQLite, `localStorage`, and session state, forcing a page reload to a blank state.
> - **Manual Sync Only**: Post-reset, the application remains empty. Synchronization must be triggered manually.
> - **Phased Sync Workflow**: The synchronization process is strictly ordered: 1. Scrape/Persist -> 2. Predict -> 3. UI Loading/Initialization. Progress is reported for each phase.

## 1. Overview & Core Concept

- **What It Does**: Ensures a completely clean state after reset and enforces a user-initiated, sequential data pipeline (Scrape → Predict → Init UI) with explicit status updates.
- **Key Value**: Guarantees data integrity and provides clear, step-by-step feedback to the user throughout the synchronization process.

## 2. User Experience & Visual Design

- **Hard Reset**: The reset action clears `localStorage`, `sessionStorage`, and SQLite, then forces `window.location.reload()` to return the app to a "clean-install" state.
- **Phased Sync Status**: Replace the generic progress bar with a granular step tracker:
    1. "Initializing Scraper..."
    2. "Persisting Raw Feeds..."
    3. "Running Prediction Engine..."
    4. "Initializing UI..."

## 3. Technical Architecture

- **Hard Reset**: `FootballDB.clearDatabase()` will be extended to clear all browser-side storage (`localStorage.clear()`) before reloading.
- **Manual Sync Engine**: A new `SyncCoordinator` service will orchestrate the three phases:
  - `Phase 1 (Scraper)`: Executes scraping logic, updating status to `SCRAPING`.
  - `Phase 2 (Engine)`: Invokes `EngineService.predict...` on the freshly scraped data, updating status to `PREDICTING`.
  - `Phase 3 (UI Init)`: Triggers final data loading into UI components, updating status to `READY`.
- **Progress Reporting**: `SyncCoordinator` will emit progress events (e.g., `sync-phase-updated`) that the `SettingsModal` and UI components subscribe to for status updates.

## 4. Phased Synchronization Flow

```
User Click "Sync" ──► Phase 1 (Scraper) ──► Phase 2 (Prediction) ──► Phase 3 (UI Init)
                         │                  │                      │
                  "Scraping..."      "Predicting..."          "Ready!"
```

- **Persistence**: All steps are sequential and blocking. Phase 2 cannot start until Phase 1 finishes.
- **UI State**: The UI remains in an "Empty" state (or shows the initialization progress) until Phase 3 finishes.
