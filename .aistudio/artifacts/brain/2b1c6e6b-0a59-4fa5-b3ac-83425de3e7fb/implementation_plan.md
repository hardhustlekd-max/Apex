# Implementation Plan: Full Migration to Raw-Only Persistence & On-Demand Parsing

Complete the architectural migration of the prediction engine and UI to the Raw-Only storage pattern, ensuring on-demand parsing is integrated into all match-related services and the UI sync flow.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Engine-wide Migration**: All prediction services will be refactored to fetch and parse raw feed data from the database on-demand.
> - **UI Integration**: The settings sync button and match detail view will be fully integrated with the on-demand parsing service and updated loading states.

## 1. Overview & Core Concept

- **What It Does**: Transitions all prediction and data-fetching services away from pre-parsed data to a pattern that fetches, parses, and provides data on-demand from the stored raw feed.
- **Key Value**: Ensures the UI always reflects the most recent (or specifically historical) raw data available, while maintaining a clean, performant, and consistent data access layer.

## 2. User Experience & Visual Design

- **Match Detail View**: Implement skeleton loaders for match stats, H2H data, and prediction panels while the `OnDemandParser` processes the raw feed.
- **UI Sync Feedback**: Improved visual feedback for the sync button in the settings modal (e.g., spinner, progress notification) during the comprehensive feed update.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1**: Parsing Responsibility.
  - *Chosen Approach*: `OnDemandParser` utility service.
  - *Why*: Centralizes the parsing logic, ensuring consistency between `MatchDetailModal`, `FixturesList`, and other prediction views.
- **Decision 2**: State Management.
  - *Chosen Approach*: React `useEffect` with `isLoading` states for on-demand parsing.
  - *Why*: Handles async parsing gracefully in the UI.

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│               UI (App, MatchDetailModal)               │
│         (Triggers Sync, Requests Detail View)          │
└───────────────┬────────────────────────────┬───────────┘
                │                            │
      ┌─────────┴───────────┐      ┌─────────┴──────────┐
      │  Sync Button Action │      │  OnDemandParser    │
      └─────────┬───────────┘      └─────────┬──────────┘
                │                            │
      ┌─────────▼───────────┐      ┌─────────▼──────────┐
      │  Scraper Service    │      │  Database (SQLite) │
      │(fetchAndPersist)    │      │ (raw_feed_data)    │
      └─────────────────────┘      └────────────────────┘
```

- **Services**:
  - `EngineService`: Update all data retrieval methods to delegate to the `OnDemandParser` for data that requires parsing.
  - `OnDemandParser` (New Utility): Exposes `parse(fixtureId)` which queries `raw_feed_data`, executes the parsing logic, and returns structured data.
- **UI Components**:
  - `SettingsModal`: Update the sync button to await `FlashscoreScraperService.syncHistoricalData()`.
  - `MatchDetailModal`: Incorporate loading state and `OnDemandParser` invocation.
