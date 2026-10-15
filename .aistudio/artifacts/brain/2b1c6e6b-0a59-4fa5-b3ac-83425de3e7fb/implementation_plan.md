# Flashscore Raw Data Persistence & On-Demand Parsing (Revised)

Shift to a strict "Raw-Only" storage architecture where all raw, unparsed Flashscore feed data is persisted indefinitely in the SQLite database. Parsing is performed on-demand when a user requests match details.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Confirmed Architecture**: Raw feed data will be stored as-is. Parsing will occur only upon demand (e.g., when viewing a specific match).
> - **Retention Policy**: All raw historical data will be stored indefinitely.
> - **Update Strategy**: **Incremental Sync**. When fetching data, the scraper will check for existence and only persist raw data that does not already exist in the database (INSERT IGNORE logic).

## 1. Overview & Core Concept

- **What It Does**: Stores the raw, delimiter-separated string feed from Flashscore directly into a new SQLite table. A specialized parser component will fetch and parse this raw data from the database only when needed.
- **Key Value**: Provides a complete, immutable audit trail of all historical feeds. Incremental sync ensures efficiency by avoiding redundant database writes.

## 2. User Experience & Visual Design

- **Sync Controls**: On-demand sync button in the UI header and settings.
- **Terminal & Status Feedback**: Real-time logging of relational ingestion progress, highlighting when data is skipped (already exists) vs. inserted.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1**: Incremental Sync Strategy.
  - *Chosen Approach*: `INSERT IGNORE` (or equivalent checks) in the database layer.
  - *Why*: Reduces database write overhead and preserves existing raw feed data integrity, preventing redundant processing.
- **Decision 2**: Performance Trade-off.
  - *Chosen Approach*: On-demand parsing.
  - *Why*: Prioritizes data completeness and availability over immediate load times.
- **Decision 3**: Database Bloat Management.
  - *Chosen Approach*: Indefinite storage.
  - *Trade-off*: Acknowledge that the SQLite database file size will grow significantly over time and will require careful maintenance or future database migration strategies.

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│               Flashscore Scraper Service               │
│ (Fetches Raw Feed, Checks Existence, Stores New Only)  │
└───────────────────────────┬────────────────────────────┘
                            │ Raw Feed Text
                            ▼
┌────────────────────────────────────────────────────────┐
│               Relational SQLite Database               │
│  - raw_feed_data (ID, PATH, RAW_TEXT, SCRAPED_AT)      │
└───────────────────────────┬────────────────────────────┘
                            │ Retrieval on Demand
                            ▼
┌────────────────────────────────────────────────────────┐
│               Parser Service (On-Demand)               │
│  (Parses Raw Feed to Structured Match Data)            │
└───────────────────────────┬────────────────────────────┘
                            │ Parsed Structured Data
                            ▼
┌────────────────────────────────────────────────────────┐
│         Apex Engine & Match Detail UI Views            │
└────────────────────────────────────────────────────────┘
```

- **Data Model & Schema**:
  - `raw_feed_data`: `fixture_id` (PK), `feed_path`, `raw_text` (TEXT), `scraped_at` (TIMESTAMP).
- **Incremental Logic**:
  - Before writing to `raw_feed_data`, the `FlashscoreScraperService` will query existence using the `fixture_id`. If found, the write operation is aborted for that specific record.
- **Parser Logic**: The existing `FlashscoreScraperService.parseFeedText()` will be adapted to be consumed by an `OnDemandParser` utility that queries the `raw_feed_data` table based on a match ID.
