/**
 * Database Schema Definition for SQLite / SQL Database
 * Keeps application data models and relational structures in system alignment
 */

export interface HistoricalMatchSchema {
  id: string; // Primary Key
  div: string; // League code e.g. E0, SP1, D1, I1
  season: string; // e.g. '2024/2025'
  match_date: string; // YYYY-MM-DD
  home_team: string;
  away_team: string;
  fthg: number; // Full-time home goals
  ftag: number; // Full-time away goals
  ftr: 'H' | 'D' | 'A'; // Full-time result
  hthg?: number | null; // Half-time home goals
  htag?: number | null; // Half-time away goals
  htr?: 'H' | 'D' | 'A' | null; // Half-time result
  hs?: number | null; // Home shots
  as_shots?: number | null; // Away shots
  hst?: number | null; // Home shots on target
  ast?: number | null; // Away shots on target
  b365_h?: number | null; // Bet365 Home Win odds
  b365_d?: number | null; // Bet365 Draw odds
  b365_a?: number | null; // Bet365 Away Win odds
  b365_over25?: number | null; // Bet365 Over 2.5 goals odds
  b365_under25?: number | null; // Bet365 Under 2.5 goals odds
  rest_days_home: number; // Rest days before match (default 7)
  rest_days_away: number; // Rest days before match (default 7)
}

export type ActiveProviderType = 'FLASHSCORE' | 'ESPN' | 'FOOTBALL_DATA_CO_UK' | 'BIG_BALLS_DATA' | 'FOOTBALL_DATA_ORG' | 'API_FOOTBALL';

export interface DynamicStatisticItemSchema {
  category: string;
  homeValue?: string | number | null;
  awayValue?: string | number | null;
}

export interface ParsedStatisticItemSchema {
  category: string;
  group: 'ALL' | 'OVERVIEW' | 'ATTACKING' | 'PASSING' | 'DEFENDING';
  home_numeric: number;
  home_raw: string;
  away_numeric: number;
  away_raw: string;
  home_share_percent: number;
  away_share_percent: number;
  leader: 'HOME' | 'AWAY' | 'TIED';
}

export interface FlashscoreScrapedMatchSchema {
  match_id: string; // Primary Key e.g. 'dtULQoFG'
  stage?: string | null;
  status: string;
  match_date: string;
  country?: string | null;
  league_name?: string | null;
  home_name: string;
  home_image?: string | null;
  away_name: string;
  away_image?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  regulation_time?: string | null;
  penalties?: string | null;
  information_json?: string | null;
  statistics_json?: string | null;
  scraped_at: string;
}

export interface UpcomingFixtureSchema {
  id: string; // Primary Key
  provider_id: ActiveProviderType | string; // Active provider e.g. 'espn' | 'ESPN'
  league: string; // Division code
  league_name: string; // League label
  stage?: string | null; // Sub division or tournament stage
  match_date: string; // YYYY-MM-DD
  kick_off_time: string; // HH:MM
  home_team: string;
  away_team: string;
  b365_h: number;
  b365_d: number;
  b365_a: number;
  b365_over25?: number | null;
  b365_under25?: number | null;
  b365_btts_yes?: number | null;
  b365_btts_no?: number | null;
  home_win_prob?: number | null; // Calculated Poisson home win probability (0-1)
  draw_prob?: number | null; // Calculated Poisson draw probability (0-1)
  away_win_prob?: number | null; // Calculated Poisson away win probability (0-1)
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'POSTPONED';
  date_source?: 'LIVE_FEED' | 'CACHED_DB' | 'INITIAL_FALLBACK';
}

export interface AppSettingsSchema {
  key: string; // Primary Key e.g. 'engine_settings'
  value: string; // JSON string of EngineSettings
}

export type QuickSlipStrategy = 'TODAY_SLIP' | 'SAFE_PICKS' | 'TOP_VALUE' | 'CUSTOM_SLIP';
export type DateFilterScope = 'TODAY' | 'TOMORROW' | 'NEXT_3_DAYS' | 'THIS_WEEK' | 'ALL' | 'CUSTOM';
export type MarketChoiceFilter = 'BEST_VALUE' | 'OVER_UNDER' | '1X2' | 'BTTS';
export type PrebuiltCategory = 'BANKER' | 'VALUE_HUNTER' | 'HIGH_GOALS' | 'MEGA_COMBO';

export interface PrebuiltAccumulatorSchema {
  id: string;
  category: PrebuiltCategory;
  name: string;
  combined_odds: number;
  combined_prob: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  legs_json: string;
  summary_text: string;
  date_scope?: DateFilterScope | string;
  server_processed?: boolean;
  unstarted_only?: boolean;
  created_at: string;
}

export interface TablePaginationSchema {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface SimplifiedTableLayoutSchema {
  time_col_width: string;
  match_col_width: string;
  prediction_col_width: string;
  odds_col_width: string;
  is_simplified: boolean;
}

export interface LeaguePriorityRankingSchema {
  tier_1_major_domestic: ('E0' | 'SP1' | 'D1' | 'I1' | 'F1')[]; // Premier League, La Liga, Bundesliga, Serie A, Ligue 1
  tier_2_uefa_tournaments: ('UCL' | 'UEL' | 'UECL')[]; // Champions League, Europa League, Conference League
  tier_3_secondary_and_cups: ('E1' | 'FAC' | 'CGB' | 'CDR' | 'DFB' | 'CIT' | 'CDF')[]; // Championship and major domestic cups
  tier_4_global_top_flights: ('N1' | 'P1' | 'BRA' | 'MLS' | 'SPL' | 'TUR1' | 'SC0' | 'BE1' | 'ARG1' | 'MEX1' | 'JPL')[]; // Eredivisie, Primeira Liga, Serie A Brazil, MLS, etc.
  prioritize_major_leagues_on_top: true;
  updated_at: string;
}

export interface FixtureDisplayScopeSchema {
  date_filter: DateFilterScope;
  filter_type: 'ALL' | 'POSITIVE_EV' | 'BANKER' | 'HIGH_XG';
  sort_order: 'LEAGUE_PRIORITY_AND_TIME' | 'CHRONOLOGICAL_TIME' | 'PROBABILITY_RANK';
  default_display: 'ALL_UPCOMING_FIXTURES';
  fallback_to_upcoming_when_empty: false;
  use_fallback_mock_data: false;
  league_priority_sorting: boolean;
  major_popular_leagues_priority_top: boolean;
  prediction_pipeline: 'PREDICT_ALL_BEFORE_FILTERING';
  worldwide_leagues_coverage_count: number; // 50+ leagues, cups and international tournaments
}

export interface MatchFilterModalLayoutSchema {
  modal_type: 'FIXED_OVERLAY_MODAL';
  z_index: 50;
  backdrop: 'backdrop-blur-xs_dark_overlay';
  radii: 'rounded-3xl';
  sections: {
    league_filter: true;
    date_range: true;
    market_filter: true;
    sort_by_percentage: true;
    search_team: true;
    view_mode: true;
  };
  unconstrained_by_parent_overflow: true;
  updated_at: '2026-10-14T09:15:00Z';
}

export interface LeagueStandingEntrySchema {
  rank: number;
  team_id?: string | null;
  team_name: string;
  badge?: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  form_json?: string | null;
}

export interface LeagueStandingTableSchema {
  league_code: string; // Primary key e.g. 'E0', 'SP1'
  league_name: string;
  country?: string | null;
  season?: string | null;
  tournament_id?: string | null;
  standings_json: string; // JSON array of LeagueStandingEntry
  source: 'FLASHSCORE_SCRAPED';
  updated_at: string;
}

export interface AppThemeConfigSchema {
  theme: 'light' | 'dark';
  style_mode: 'borderless_shadow';
  updated_at: string;
}

export type MatchListScopeType = 'UPCOMING' | 'LIVE' | 'HISTORY';

export interface MatchListScopeConfigSchema {
  active_scope: MatchListScopeType;
  available_scopes: MatchListScopeType[];
  inplay_bar_removed: boolean;
}

export interface NavigationBarLayoutSchema {
  tabs_placement: 'UNDER_LIVE_MATCHES_BAR';
  active_tabs: ('FIXTURES' | 'ACCAS' | 'STANDINGS' | 'TIPS')[];
  tab_labels: {
    FIXTURES: 'Predictions';
    ACCAS: 'Accumulator';
    STANDINGS: 'Standings';
    TIPS: 'Trends';
  };
  tab_icons_enabled: false;
  prevent_mobile_wrap: true;
  prebuilt_accas_mode: 'STREAMLINED_DESIGN_SYSTEM';
  trends_insights_mode: 'STREAMLINED_DESIGN_SYSTEM';
  design_system_compliant: true;
  updated_at: string;
}

export interface DesignSystemComplianceSchema {
  palette: {
    surface_dark: '#0B0F17';
    surface_light: '#FFFFFF';
    background_dark: '#070A0F';
    background_light: '#F1F5F9';
    accent_emerald: 'emerald-600';
    border_dark: 'slate-800';
    border_light: 'slate-100';
    segmented_track_dark: 'slate-900/80';
    segmented_track_light: 'slate-100';
  };
  typography: {
    compact_headers: true;
    no_verbose_descriptions: true;
    no_slash_alternatives: true;
    anti_text_wrapping_enforced: true;
    whitespace_nowrap_badges_and_labels: true;
    base_html_scaling_normalized: '100%';
  };
  radii: {
    outer_card: 'rounded-3xl';
    inner_card: 'rounded-2xl';
    button_or_pill: 'rounded-xl';
    badge: 'rounded-lg';
  };
  updated_at: string;
}

export interface MatchDetailModalLayoutSchema {
  modal_surface: 'borderless_shadow_rounded_3xl';
  hero_scoreboard_banner: {
    layout: '3_column_hero_banner';
    club_crests: true;
    win_probability_pills: true;
    live_inplay_indicator: true;
    quick_projections_list: false;
  };
  segmented_subtabs: ('OVERVIEW' | 'H2H' | 'STATS' | 'TEAMS')[];
  tab_labels: {
    OVERVIEW: 'Overview';
    H2H: 'H2H';
    STATS: 'Statistics';
    TEAMS: 'Team Form';
  };
  tabs_icons_enabled: false;
  tabs_prevent_wrap: true;
  tabs_overflow_control: 'no_scrollbar_scroll_guard';
  default_tab: 'OVERVIEW';
  sections: {
    outcome_probabilities_gauge: true;
    outcome_probabilities_projections_list: true;
    market_projections_list: true;
    most_probable_scorelines: true;
    poisson_probability_heatmap: true;
    head_to_head_live_sync: true;
    dynamic_statistics_breakdown: true;
    team_form_and_ratings: true;
  };
  info_cards_layout: {
    outcome_probabilities_projections: 'list';
    market_projections: 'list';
    venue_details: 'list';
    head_to_head_metrics: 'list';
    team_ratings: 'list';
  };
  head_to_head_header: {
    show_previous_encounters_count: false;
    header_style: 'standard_title_case_bold';
  };
  section_header_styling: 'standard_title_case_bold';
  design_system_compliant: true;
  no_slash_alternative_texts: true;
  compact_non_verbose_labels: true;
  updated_at: '2026-10-14T09:05:00Z';
}

export interface PredictionsWireframeLayoutSchema {
  date_time_column_removed: true;
  date_time_placement: 'UNDER_CLUBS_NAME';
  clubs_column_span: 7;
  tip_column_span: 2;
  probabilities_column_span: 3;
  column_header_alignment_mode: 'STRICT_GRID_12_COL';
  column_headers: {
    clubs_header: 'LEAGUE_SUBDIVISION';
    tip_header: 'TIP';
    probabilities_headers: ['1', 'X', '2'];
  };
  overdesign_elements_removed: true;
  card_within_card_nesting_eliminated: true;
  decorative_chart_icons_removed: true;
  decorative_header_bullets_removed: true;
  pill_bloat_and_fuzzy_shadows_removed: true;
  design_system_radius_normalized: true;
  club_crests_enabled: true;
  date_time_separator: '•';
  live_and_ft_status_integrated: true;
  updated_at: string;
}

export interface ServerlessDeploymentConfigSchema {
  api_prefix: string;
  is_serverless: boolean;
  process_type: 'persistent_node_process' | 'serverless';
  db_storage_mode: 'file' | 'in_memory' | 'temp_volume';
  db_file_path: './data/football.sqlite';
  auto_seed_on_boot: boolean;
  historical_records_count: number; // 3,600+ real Flashscore scraped matches
  upcoming_fixtures_count: number; // 3,500+ live Flashscore scraped fixtures
  data_provider: 'FLASHSCORE_SCRAPING';
  vercel_catchall_supported: boolean;
  updated_at: string;
}

export interface LiveScoresCacheSchema {
  fixture_id: string; // Primary Key
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
  minute: number;
  status: string; // 'FIRST_HALF' | 'HALF_TIME' | 'SECOND_HALF' | 'EXTRA_TIME' | 'FINISHED'
  events_json?: string | null;
  updated_at: string; // ISO timestamp
}

export interface FootballTipsCacheSchema {
  id: string; // Primary Key e.g. 'latest_tips'
  tips_json: string;
  headline_summary: string;
  raw_markdown: string;
  sources_json: string;
  updated_at: string; // ISO timestamp
}

export interface PredictionMeasurementsSchema {
  fixture_id: string; // Primary Key
  h2h_json: string;
  calculated_at: string;
  use_mockup_fallback_data: false;
}

export interface TeamFormMatchSchema {
  date: string;
  opponent: string;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  result: 'W' | 'D' | 'L';
  competition?: string;
}

export interface FlashscoreScrapedH2HSchema {
  match_id: string; // Primary Key
  matches_count: number;
  home_wins: number;
  draws: number;
  away_wins: number;
  home_goals_avg: number;
  away_goals_avg: number;
  h2h_multiplier_home: number;
  h2h_multiplier_away: number;
  encounters_json: string; // Serialized HeadToHeadMatchRecord[]
  home_club?: string;
  away_club?: string;
  home_recent_matches_json?: string; // Serialized TeamFormMatch[] parsed from scrapper response
  away_recent_matches_json?: string; // Serialized TeamFormMatch[] parsed from scrapper response
  scraped_feed: 'df_hh_1';
  scraped_at: string;
  fallback_mockup_data: false;
}

export interface UpcomingPredictionRecordSchema {
  fixture_id: string; // Primary Key
  league: string;
  league_name: string;
  stage?: string | null;
  match_date: string; // YYYY-MM-DD
  kick_off_time: string; // HH:MM
  home_team: string;
  away_team: string;
  home_badge?: string | null;
  away_badge?: string | null;
  status: string;
  b365_h: number;
  b365_d: number;
  b365_a: number;
  b365_over25?: number | null;
  b365_under25?: number | null;
  b365_btts_yes?: number | null;
  b365_btts_no?: number | null;
  home_xg: number;
  away_xg: number;
  home_win_prob: number;
  draw_prob: number;
  away_win_prob: number;
  over15_prob: number;
  over25_prob: number;
  over35_prob: number;
  btts_prob: number;
  tip_key: string;
  tip_name: string;
  tip_odds: number;
  tip_prob: number;
  tip_ev: number;
  is_positive_ev: number;
  is_banker: number;
  full_fixture_json: string; // Serialized complete Fixture with markets, stats & matrix
  predicted_at: string;
}

export interface EloRatingBreakdownSchema {
  home_elo: number;
  away_elo: number;
  elo_difference: number;
  home_advantage_elo: number;
  home_win_prob_elo: number;
  draw_prob_elo: number;
  away_win_prob_elo: number;
}

export interface XGBreakdownSchema {
  home_raw_xg: number;
  home_adjusted_xg: number;
  away_raw_xg: number;
  away_adjusted_xg: number;
  opponent_adjustment_factor_home: number;
  opponent_adjustment_factor_away: number;
  home_rolling_matches_evaluated: number;
  away_rolling_matches_evaluated: number;
}

export interface TacticalContextBreakdownSchema {
  rest_days_home: number;
  rest_days_away: number;
  rest_differential: number;
  fatigue_adjustment_home: number;
  fatigue_adjustment_away: number;
  tactical_notes_json: string;
}

export interface MostLikelyOutcomeSchema {
  selection: string;
  market_key: string;
  probability: number;
  odds: number;
  expected_value: number;
  is_profitable: boolean;
  commentary: string;
}

export interface ProfitableBetSchema {
  selection: string;
  market_key: string;
  probability: number;
  odds: number;
  expected_value: number;
  edge_percent: number;
  fair_odds: number;
  kelly_stake_percent: number;
  commentary: string;
}

export interface DixonColesGoalModelSchema {
  rho: number; // Low-scoring correlation parameter (-0.11)
  home_lambda: number;
  away_mu: number;
  tau_0_0: number;
  tau_1_0: number;
  tau_0_1: number;
  tau_1_1: number;
}

export interface EvidenceBasedPredictionEngineSchema {
  model_type: 'DIXON_COLES_EVIDENCE_BASED';
  version: '2.0.0';
  pillars: {
    pillar_1_xg_recent_performance: {
      window_size_matches: '5-10';
      chance_quality_sot_weight: 0.31;
      chance_quality_off_target_weight: 0.06;
      opponent_strength_adjustment: true;
      avoid_raw_win_loss_reliance: true;
    };
    pillar_2_augmented_elo: {
      base_elo: 1500;
      home_ground_advantage_elo: 65;
      margin_of_victory_multiplier: true;
      opponent_quality_weighting: true;
    };
    pillar_3_tactical_and_team_news: {
      rest_days_evaluation: true;
      fatigue_discount_short_turnaround: true;
      bounded_adjustment_range: '[0.90, 1.10]';
      statistical_evidence_first: true;
    };
    pillar_4_dixon_coles_goal_model: {
      bivariate_poisson: true;
      low_scoring_correlation_tau: true;
      rho_parameter: -0.11;
      matrix_dimensions: '6x6';
    };
    pillar_5_value_betting_distinction: {
      distinguish_most_likely_vs_profitable: true;
      expected_value_ev_calculation: true;
      fair_odds_calculation: true;
      kelly_criterion_stake_sizing: true;
    };
  };
  updated_at: string;
}

export interface LivePredictionRecordSchema {
  fixture_id: string; // Primary Key
  league: string;
  league_name: string;
  stage?: string | null;
  match_date: string; // YYYY-MM-DD
  kick_off_time: string; // HH:MM or Minute'
  home_team: string;
  away_team: string;
  home_badge?: string | null;
  away_badge?: string | null;
  status: 'LIVE';
  minute: number;
  home_score: number;
  away_score: number;
  b365_h: number;
  b365_d: number;
  b365_a: number;
  home_xg: number;
  away_xg: number;
  home_win_prob: number;
  draw_prob: number;
  away_win_prob: number;
  over15_prob: number;
  over25_prob: number;
  over35_prob: number;
  btts_prob: number;
  tip_key: string;
  tip_name: string;
  tip_odds: number;
  tip_prob: number;
  tip_ev: number;
  is_positive_ev: number;
  is_banker: number;
  full_fixture_json: string;
  predicted_at: string;
}

export interface HistoricalPredictionRecordSchema {
  fixture_id: string; // Primary Key
  league: string;
  league_name: string;
  stage?: string | null;
  match_date: string; // YYYY-MM-DD
  kick_off_time: string; // FT
  home_team: string;
  away_team: string;
  home_badge?: string | null;
  away_badge?: string | null;
  status: 'FINISHED';
  home_score: number;
  away_score: number;
  b365_h: number;
  b365_d: number;
  b365_a: number;
  home_xg: number;
  away_xg: number;
  home_win_prob: number;
  draw_prob: number;
  away_win_prob: number;
  over15_prob: number;
  over25_prob: number;
  over35_prob: number;
  btts_prob: number;
  tip_key: string;
  tip_name: string;
  tip_odds: number;
  tip_prob: number;
  tip_ev: number;
  is_positive_ev: number;
  is_banker: number;
  full_fixture_json: string;
  predicted_at: string;
}

export interface PredictionsDatabaseConfigSchema {
  database_file: './data/predictions.sqlite';
  is_separate_db: true;
  storage_target: 'SEPARATE_PREDICTIONS_SQLITE';
  sync_triggers_recalculation: true;
  serve_display_from_db: true;
  serve_live_from_db: true;
  serve_history_from_db: true;
  updated_at: string;
}

export const DDL_STATEMENTS = {
  createHistoricalMatches: `
    CREATE TABLE IF NOT EXISTS historical_matches (
      id TEXT PRIMARY KEY,
      div TEXT NOT NULL,
      season TEXT NOT NULL,
      match_date TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      fthg INTEGER NOT NULL,
      ftag INTEGER NOT NULL,
      ftr TEXT NOT NULL,
      hthg INTEGER,
      htag INTEGER,
      htr TEXT,
      hs INTEGER,
      as_shots INTEGER,
      hst INTEGER,
      ast INTEGER,
      b365_h REAL,
      b365_d REAL,
      b365_a REAL,
      b365_over25 REAL,
      b365_under25 REAL,
      rest_days_home INTEGER DEFAULT 7,
      rest_days_away INTEGER DEFAULT 7
    );
  `,
  createUpcomingFixtures: `
    CREATE TABLE IF NOT EXISTS upcoming_fixtures (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      league TEXT NOT NULL,
      league_name TEXT NOT NULL,
      match_date TEXT NOT NULL,
      kick_off_time TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      b365_h REAL NOT NULL,
      b365_d REAL NOT NULL,
      b365_a REAL NOT NULL,
      b365_over25 REAL,
      b365_under25 REAL,
      b365_btts_yes REAL,
      b365_btts_no REAL,
      status TEXT NOT NULL DEFAULT 'SCHEDULED'
    );
    CREATE INDEX IF NOT EXISTS idx_upcoming_date ON upcoming_fixtures(match_date);
  `,
  createAppSettings: `
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `,
  createLiveScoresCache: `
    CREATE TABLE IF NOT EXISTS live_scores_cache (
      fixture_id TEXT PRIMARY KEY,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      home_score INTEGER NOT NULL DEFAULT 0,
      away_score INTEGER NOT NULL DEFAULT 0,
      minute INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'FIRST_HALF',
      events_json TEXT,
      updated_at TEXT NOT NULL
    );
  `,
  createFootballTipsCache: `
    CREATE TABLE IF NOT EXISTS football_tips_cache (
      id TEXT PRIMARY KEY,
      tips_json TEXT NOT NULL,
      headline_summary TEXT NOT NULL,
      raw_markdown TEXT NOT NULL,
      sources_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
  createFlashscoreMatches: `
    CREATE TABLE IF NOT EXISTS flashscore_scraped_matches (
      match_id TEXT PRIMARY KEY,
      stage TEXT,
      status TEXT NOT NULL,
      match_date TEXT NOT NULL,
      country TEXT,
      league_name TEXT,
      home_name TEXT NOT NULL,
      home_image TEXT,
      away_name TEXT NOT NULL,
      away_image TEXT,
      home_score INTEGER,
      away_score INTEGER,
      regulation_time TEXT,
      penalties TEXT,
      information_json TEXT,
      statistics_json TEXT,
      scraped_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_flashscore_matches_date ON flashscore_scraped_matches(match_date);
    CREATE INDEX IF NOT EXISTS idx_flashscore_matches_home ON flashscore_scraped_matches(home_name);
    CREATE INDEX IF NOT EXISTS idx_flashscore_matches_away ON flashscore_scraped_matches(away_name);
  `,
  createPrebuiltAccumulatorsCache: `
    CREATE TABLE IF NOT EXISTS prebuilt_accumulators_cache (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      date_scope TEXT NOT NULL,
      combined_odds REAL NOT NULL,
      combined_prob REAL NOT NULL,
      risk_level TEXT NOT NULL,
      unstarted_only INTEGER DEFAULT 1,
      slip_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_prebuilt_cache_scope ON prebuilt_accumulators_cache(date_scope);
  `,
  createPredictionMeasurementsCache: `
    CREATE TABLE IF NOT EXISTS prediction_measurements_cache (
      fixture_id TEXT PRIMARY KEY,
      h2h_json TEXT NOT NULL,
      calculated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pred_measurements_fixture ON prediction_measurements_cache(fixture_id);
  `,
  createUpcomingPredictionsTable: `
    CREATE TABLE IF NOT EXISTS upcoming_predictions (
      fixture_id TEXT PRIMARY KEY,
      league TEXT NOT NULL,
      league_name TEXT NOT NULL,
      stage TEXT,
      match_date TEXT NOT NULL,
      kick_off_time TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      home_badge TEXT,
      away_badge TEXT,
      status TEXT NOT NULL DEFAULT 'SCHEDULED',
      b365_h REAL NOT NULL,
      b365_d REAL NOT NULL,
      b365_a REAL NOT NULL,
      b365_over25 REAL,
      b365_under25 REAL,
      b365_btts_yes REAL,
      b365_btts_no REAL,
      home_xg REAL NOT NULL,
      away_xg REAL NOT NULL,
      home_win_prob REAL NOT NULL,
      draw_prob REAL NOT NULL,
      away_win_prob REAL NOT NULL,
      over15_prob REAL NOT NULL,
      over25_prob REAL NOT NULL,
      over35_prob REAL NOT NULL,
      btts_prob REAL NOT NULL,
      tip_key TEXT NOT NULL,
      tip_name TEXT NOT NULL,
      tip_odds REAL NOT NULL,
      tip_prob REAL NOT NULL,
      tip_ev REAL NOT NULL,
      is_positive_ev INTEGER NOT NULL DEFAULT 0,
      is_banker INTEGER NOT NULL DEFAULT 0,
      full_fixture_json TEXT NOT NULL,
      predicted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pred_date ON upcoming_predictions(match_date);
    CREATE INDEX IF NOT EXISTS idx_pred_league ON upcoming_predictions(league);
  `,
  createLivePredictionsTable: `
    CREATE TABLE IF NOT EXISTS live_predictions (
      fixture_id TEXT PRIMARY KEY,
      league TEXT NOT NULL,
      league_name TEXT NOT NULL,
      stage TEXT,
      match_date TEXT NOT NULL,
      kick_off_time TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      home_badge TEXT,
      away_badge TEXT,
      status TEXT NOT NULL DEFAULT 'LIVE',
      minute INTEGER DEFAULT 0,
      home_score INTEGER DEFAULT 0,
      away_score INTEGER DEFAULT 0,
      b365_h REAL NOT NULL,
      b365_d REAL NOT NULL,
      b365_a REAL NOT NULL,
      home_xg REAL NOT NULL,
      away_xg REAL NOT NULL,
      home_win_prob REAL NOT NULL,
      draw_prob REAL NOT NULL,
      away_win_prob REAL NOT NULL,
      over15_prob REAL NOT NULL,
      over25_prob REAL NOT NULL,
      over35_prob REAL NOT NULL,
      btts_prob REAL NOT NULL,
      tip_key TEXT NOT NULL,
      tip_name TEXT NOT NULL,
      tip_odds REAL NOT NULL,
      tip_prob REAL NOT NULL,
      tip_ev REAL NOT NULL,
      is_positive_ev INTEGER NOT NULL DEFAULT 0,
      is_banker INTEGER NOT NULL DEFAULT 0,
      full_fixture_json TEXT NOT NULL,
      predicted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_live_league ON live_predictions(league);
  `,
  createHistoricalPredictionsTable: `
    CREATE TABLE IF NOT EXISTS historical_predictions (
      fixture_id TEXT PRIMARY KEY,
      league TEXT NOT NULL,
      league_name TEXT NOT NULL,
      stage TEXT,
      match_date TEXT NOT NULL,
      kick_off_time TEXT NOT NULL DEFAULT 'FT',
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      home_badge TEXT,
      away_badge TEXT,
      status TEXT NOT NULL DEFAULT 'FINISHED',
      home_score INTEGER NOT NULL,
      away_score INTEGER NOT NULL,
      b365_h REAL NOT NULL,
      b365_d REAL NOT NULL,
      b365_a REAL NOT NULL,
      home_xg REAL NOT NULL,
      away_xg REAL NOT NULL,
      home_win_prob REAL NOT NULL,
      draw_prob REAL NOT NULL,
      away_win_prob REAL NOT NULL,
      over15_prob REAL NOT NULL,
      over25_prob REAL NOT NULL,
      over35_prob REAL NOT NULL,
      btts_prob REAL NOT NULL,
      tip_key TEXT NOT NULL,
      tip_name TEXT NOT NULL,
      tip_odds REAL NOT NULL,
      tip_prob REAL NOT NULL,
      tip_ev REAL NOT NULL,
      is_positive_ev INTEGER NOT NULL DEFAULT 0,
      is_banker INTEGER NOT NULL DEFAULT 0,
      full_fixture_json TEXT NOT NULL,
      predicted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hist_pred_date ON historical_predictions(match_date);
    CREATE INDEX IF NOT EXISTS idx_hist_pred_league ON historical_predictions(league);
  `,
  createLeagueStandingsTable: `
    CREATE TABLE IF NOT EXISTS league_standings (
      league_code TEXT PRIMARY KEY,
      league_name TEXT NOT NULL,
      country TEXT,
      season TEXT,
      tournament_id TEXT,
      standings_json TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'FLASHSCORE_SCRAPED',
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_standings_league ON league_standings(league_code);
  `,
};
