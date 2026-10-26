# Flashscore Multi-Year Archive Scraper Fix & Automation Pipeline

Implementation plan for upgrading the Flashscore scraper to support multi-year historical season crawling, Playwright headless fallback on HTTP rate limits, and paginated tournament feed parsing for global leagues.

## User Review & Critical Decisions

> [!IMPORTANT]
> The user confirmed the following architectural decisions for the scraper upgrade:

- **Confirmed Decision 1 (Historical Strategy)**: On-demand multi-year archive scraping via past season URLs (`/football/{country}/{league}/archive`), resolving individual season stage IDs and fetching complete match results.
- **Confirmed Decision 2 (Anti-Bot & Timeout Mitigation)**: Headless browser fallback using automated Playwright sessions whenever direct HTTP raw feed requests (`/x/feed/`) fail or hit Cloudflare/403/429 rate limits.
- **Confirmed Decision 3 (Historical Window Depth)**: Sync the last 2 complete seasons automatically across global leagues during background sync jobs.

---

## 1. Overview & Core Concept

### What It Does
This feature overhauls the Flashscore scraping service (`FlashscoreScraperService` and `packages/FlashscoreScraping`) to move beyond 7-day rolling daily feeds. The scraper will dynamically discover past season archives, parse tournament stage hashes, fetch paginated match feeds (`/x/feed/tr_1_...`), and fall back to Playwright headless browser automation when direct HTTP requests are throttled.

### Key Value
- **Historical Accuracy**: Provides 2 full seasons of complete match data for all configured leagues, improving Dixon-Coles Poisson model predictions and Head-to-Head calculations.
- **Resilience**: Eliminates silent data gaps caused by Flashscore feed blocks or Cloudflare checks by auto-failing over to browser automation.
- **On-Demand Depth**: Enables instant on-demand fetching of historical season archives when viewing league standings or detailed match analysis.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Background Full Sync Flow**:
   - User triggers "Sync Engine Data" from Settings or Terminal.
   - Sync progress bar displays real-time steps: Archival Discovery -> Season Stage Parsing -> Paginated Feed Ingestion -> Poisson Recalibration.
   - If HTTP feeds fail, terminal logs report "Activating Playwright Headless Fallback" and seamlessly continue data ingestion.
2. **On-Demand League Archive Flow**:
   - User opens the League Standings or Fixtures modal and selects a league.
   - If historical data for the past 2 seasons is incomplete, the app fires an on-demand archive sync for that specific competition.
   - Real-time notification toast indicates archive results synced.

### Interactive Feedback & Terminal Visibility
- **Terminal Modal**: Clear color-coded diagnostic logs for scraper steps (`DATA_FETCH`, `SCRAPER`, `ENGINE`).
- **Progress Tracking**: Detailed step indicators showing number of historical matches parsed per season and provider status.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Two-Stage Archive Fetching (HTML Stage Hash + Paginated Feed)
- **Chosen Approach**: First fetch `/football/{country}/{league}/archive` to locate season URLs and extract the internal tournament stage hash (`stage_id`). Next, query the paginated result feed (`/x/feed/tr_1_{stage_id}_{page}_3_en_1`).
- **Why**: Flashscore HTML only embeds the first 50–100 matches of a season in static JS (`cjs.initialFeeds`). Paginated feed querying retrieves all 380+ matches per season efficiently.

### Decision 2: Playwright Automation as On-Demand Fallback
- **Chosen Approach**: Direct HTTP `fetch` remains the primary fast path (~200ms per feed). When HTTP responses return empty strings, 403/429 codes, or missing initial DOM feeds, the scraper launches a headless Playwright context to navigate the page, handle DOM rendering, and return raw result payloads.
- **Why**: Avoids the resource overhead of running browser automation on every request while maintaining 100% resilience against anti-bot challenges.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        User Interface & Services                       │
│     SettingsModal  │  TerminalModal  │  SyncJobService  │  ServerEngine │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      FlashscoreScraperService                          │
│                                                                        │
│  ┌───────────────────────────┐         ┌────────────────────────────┐  │
│  │ Direct HTTP Feed Handler  │ ──403──▶│  Playwright Headless       │  │
│  │ (FSIGN Header / /x/feed/) │         │  Browser Scraper Fallback  │  │
│  └─────────────┬─────────────┘         └─────────────┬──────────────┘  │
│                │                                     │                 │
└────────────────┼─────────────────────────────────────┼─────────────────┘
                 │                                     │
                 ▼                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Archive Discovery & Feed Parser                      │
│  • Archive Crawler: /football/{league}/archive                         │
│  • Stage ID Extractor & Feed Pager (/x/feed/tr_1_{stage_id}_{page})    │
│  • Delimiter Parser (AA÷, AB÷, AE÷, AF÷, AG÷, AH÷, AD÷)                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Database & Prediction Store                          │
│  • Historical Matches Table (SQLite / Turso)                           │
│  • Unified Predictions Store (Dixon-Coles Parameters)                  │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Processing Pipeline
1. **Archive Listing Parser**: Extracts season list (`[{ name: '2023/2024', url: '...' }]`) for the last 2 completed seasons.
2. **Stage Feed Extractor**: Extracts stage key and pages through `/x/feed/tr_1_{stage_id}_{page}_3_en_1` until all historical matches are parsed into standard `HistoricalMatch` objects.
3. **Database Integration**: Inserts scraped matches into `historical_matches` table and triggers `ServerEngine.predictAndStoreHistoricalMatches()`.
