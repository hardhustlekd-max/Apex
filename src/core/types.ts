export type LeagueCode = string;

export interface HistoricalMatch {
  id: string;
  div: LeagueCode | string;
  season: string;
  matchDate: string;
  homeTeam: string;
  awayTeam: string;
  fthg: number; // Full Time Home Goals
  ftag: number; // Full Time Away Goals
  ftr: 'H' | 'D' | 'A'; // Full Time Result
  hs?: number; // Home Shots
  asShots?: number; // Away Shots
  hst?: number; // Home Shots on Target
  ast?: number; // Away Shots on Target
  leagueName?: string;
}

export interface ScrapedMarketOdds {
  provider: 'FLASHSCORE';
  fetchedAt: string;
  bookmakersCount?: number;
  homeParticipantId?: string;
  awayParticipantId?: string;
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
  homeImpliedProb?: number;
  drawImpliedProb?: number;
  awayImpliedProb?: number;
  dc1XOdds?: number;
  dc12Odds?: number;
  dcX2Odds?: number;
  dc1XImpliedProb?: number;
  dcX2ImpliedProb?: number;
  over15Odds?: number;
  under15Odds?: number;
  over15ImpliedProb?: number;
  over25Odds?: number;
  under25Odds?: number;
  over25ImpliedProb?: number;
  under25ImpliedProb?: number;
  over35Odds?: number;
  under35Odds?: number;
  over35ImpliedProb?: number;
  bttsYesOdds?: number;
  bttsNoOdds?: number;
  bttsYesImpliedProb?: number;
  bttsNoImpliedProb?: number;
  topCorrectScores?: Array<{
    score: string;
    odds: number;
    impliedProb: number;
  }>;
}

export type MarketKey =
  | 'HOME_WIN'
  | 'DRAW'
  | 'AWAY_WIN'
  | 'DOUBLE_CHANCE_1X'
  | 'DOUBLE_CHANCE_X2'
  | 'DOUBLE_CHANCE_12'
  | 'DNB_HOME'
  | 'DNB_AWAY'
  | 'OVER_05'
  | 'UNDER_05'
  | 'OVER_15'
  | 'UNDER_15'
  | 'OVER_25'
  | 'UNDER_25'
  | 'OVER_35'
  | 'UNDER_35'
  | 'OVER_45'
  | 'UNDER_45'
  | 'BTTS_YES'
  | 'BTTS_NO'
  | 'COMBO_1_OVER_15'
  | 'COMBO_2_OVER_15'
  | 'COMBO_1_OVER_25'
  | 'COMBO_2_OVER_25'
  | 'COMBO_1_OVER_35'
  | 'COMBO_2_OVER_35'
  | 'COMBO_1_UNDER_25'
  | 'COMBO_2_UNDER_25'
  | 'COMBO_1_UNDER_35'
  | 'COMBO_2_UNDER_35'
  | 'COMBO_X_UNDER_25'
  | 'COMBO_X_OVER_15'
  | 'COMBO_X_BTTS'
  | 'COMBO_1X_OVER_15'
  | 'COMBO_X2_OVER_15'
  | 'COMBO_12_OVER_15'
  | 'COMBO_1X_OVER_25'
  | 'COMBO_X2_OVER_25'
  | 'COMBO_12_OVER_25'
  | 'COMBO_1X_UNDER_25'
  | 'COMBO_X2_UNDER_25'
  | 'COMBO_1X_UNDER_35'
  | 'COMBO_X2_UNDER_35'
  | 'COMBO_12_UNDER_35'
  | 'COMBO_1X_BTTS'
  | 'COMBO_X2_BTTS'
  | 'COMBO_12_BTTS'
  | 'COMBO_BTTS_OVER_25'
  | 'COMBO_BTTS_OVER_35'
  | 'COMBO_BTTS_UNDER_35'
  | 'COMBO_BTTS_NO_UNDER_25'
  | 'COMBO_1_BTTS'
  | 'COMBO_2_BTTS'
  | 'HOME_OVER_05'
  | 'HOME_UNDER_05'
  | 'HOME_OVER_15'
  | 'HOME_UNDER_15'
  | 'HOME_OVER_25'
  | 'HOME_UNDER_25'
  | 'AWAY_OVER_05'
  | 'AWAY_UNDER_05'
  | 'AWAY_OVER_15'
  | 'AWAY_UNDER_15'
  | 'AWAY_OVER_25'
  | 'AWAY_UNDER_25'
  | 'HOME_CLEAN_SHEET'
  | 'AWAY_CLEAN_SHEET'
  | 'HOME_WIN_TO_NIL'
  | 'AWAY_WIN_TO_NIL'
  | 'HANDICAP_HOME_MINUS_1'
  | 'HANDICAP_AWAY_MINUS_1'
  | 'MULTIGOALS_1_3'
  | 'MULTIGOALS_2_4'
  | 'MULTIGOALS_2_5'
  | 'GOALS_ODD'
  | 'GOALS_EVEN';

export interface MarketOption {
  key: MarketKey;
  name: string;
  probability: number;
  isBanker: boolean;
  isMostLikely?: boolean;
  marketOdds?: number;
  evEdge?: number;
  minEvThreshold?: number;
  isPositiveEV?: boolean;
  kellyStakeFraction?: number;
}

export interface CorrectScoreProb {
  homeGoals: number;
  awayGoals: number;
  score: string;
  probability: number;
}

export interface HeadToHeadMatchRecord {
  date: string;
  homeTeam: string;
  awayTeam: string;
  score: string;
  winner: 'HOME' | 'AWAY' | 'DRAW';
  competition?: string;
}

export interface HeadToHeadMeasurement {
  parserVersion?: number;
  matchesCount: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  homeGoalsAvg: number;
  awayGoalsAvg: number;
  h2hMultiplierHome: number;
  h2hMultiplierAway: number;
  recentH2H: HeadToHeadMatchRecord[];
  homeClub?: string;
  awayClub?: string;
  homeRecentMatches?: TeamFormMatch[];
  awayRecentMatches?: TeamFormMatch[];
}

export interface PredictionEngineMeasurements {
  h2h: HeadToHeadMeasurement;
}

export interface TeamFormMatch {
  date: string;
  opponent: string;
  isHome: boolean;
  goalsFor: number;
  goalsAgainst: number;
  result: 'W' | 'D' | 'L';
  competition?: string;
  shotsFor?: number;
  shotsAgainst?: number;
  shotsOnTargetFor?: number;
  shotsOnTargetAgainst?: number;
}

export interface TeamStatsSummary {
  teamName: string;
  homeAttack: number;
  homeDefense: number;
  awayAttack: number;
  awayDefense: number;
  recentForm: ('W' | 'D' | 'L')[];
  formScore: number; // 0.8 to 1.2 multiplier
  matchesPlayed: number;
  goalsScored: number;
  goalsConceded: number;
  avgGoalsScored: number;
  avgGoalsConceded: number;
  recentMatches: TeamFormMatch[];
  opponentAdjustedXG?: number;
  opponentAdjustedXGA?: number;
  teamStrengthRating?: number;
  eloRating?: number;
}

export interface TeamStrengthBreakdown {
  homeStrengthRating: number; // 0 - 100 overall CSF Index
  awayStrengthRating: number;
  formDominanceHome: number;
  formDominanceAway: number;
  tableMomentumHome: number;
  tableMomentumAway: number;
  shotEfficiencyHome: number;
  shotEfficiencyAway: number;
  venueModifierHome: number;
  venueModifierAway: number;
  strengthDifference: number;
  homeWinExpectancy: number;
  drawExpectancy: number;
  awayWinExpectancy: number;
}

export interface EloRatingBreakdown {
  homeElo: number;
  awayElo: number;
  eloDifference: number;
  homeAdvantageElo?: number;
  homeWinProbElo: number;
  drawProbElo: number;
  awayWinProbElo: number;
}

export interface XGBreakdown {
  homeRawXG: number;
  homeAdjustedXG: number;
  awayRawXG: number;
  awayAdjustedXG: number;
  opponentAdjustmentFactorHome: number;
  opponentAdjustmentFactorAway: number;
  homeRollingMatchesEvaluated: number;
  awayRollingMatchesEvaluated: number;
}

export interface TacticalContextBreakdown {
  restDaysHome: number;
  restDaysAway: number;
  restDifferential: number;
  fatigueAdjustmentHome: number;
  fatigueAdjustmentAway: number;
  tacticalNotes: string[];
}

export interface MostLikelyOutcome {
  selection: string;
  marketKey: MarketOption['key'];
  probability: number;
  commentary: string;
}

export interface DixonColesParams {
  rho: number;
  homeLambda: number;
  awayMu: number;
  tau00: number;
  tau10: number;
  tau01: number;
  tau11: number;
}

export interface MatchTacticalContextInput {
  restDaysHome?: number;
  restDaysAway?: number;
  information?: {
    category: string;
    value: string;
  }[];
  stage?: string;
  venue?: string;
}

export interface TeamStandingsSnapshot {
  rank: number;
  totalTeams: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  ppg: number;
  gfPerGame: number;
  gaPerGame: number;
  gdPerGame: number;
  form?: ('W' | 'D' | 'L')[];
  zoneCode?: string;
  zoneLabel?: string;
  groupName?: string;
  reliabilityWeight: number;
}

export interface StandingsPredictionContext {
  leagueCode: string;
  leagueName: string;
  season?: string;
  groupName?: string;
  home?: TeamStandingsSnapshot;
  away?: TeamStandingsSnapshot;
  tableAvgGoalsPerGame: number;
  attackAnchorHome: number;
  defenseAnchorHome: number;
  attackAnchorAway: number;
  defenseAnchorAway: number;
  motivationMultiplierHome: number;
  motivationMultiplierAway: number;
  xgDeltaPercentHome?: number;
  xgDeltaPercentAway?: number;
  rankDiff?: number;
  pointsDiff?: number;
  ppgDiff?: number;
}

export interface LeagueVolatilityRecord {
  league_id: string;
  league_name: string;
  volatility_coefficient: number;
  historical_log_loss: number;
  elo_spread_iqr: number;
  matches_evaluated: number;
  temperature_alpha?: number;
  is_fallback?: boolean;
  updated_at?: string;
}

export interface VolatilityCalibrationContext {
  leagueId: string;
  leagueName?: string;
  volatilityCoefficient: number;
  temperatureAlpha: number;
  temperature: number;
  effectiveEloKs: number[];
  effectivePriorWeight: number;
  monteCarloSigma: number;
  minEvThreshold: number;
  kellyFraction: number;
  isFallback: boolean;
}

export interface MonteCarloSimulationSummary {
  iterations: number;
  sigmaEffective: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  over25Prob: number;
  bttsProb: number;
  homeGoalsP10: number;
  homeGoalsP50: number;
  homeGoalsP90: number;
  awayGoalsP10: number;
  awayGoalsP50: number;
  awayGoalsP90: number;
}

export interface ValueBetRecommendation {
  key: MarketKey;
  name: string;
  probability: number;
  marketOdds: number;
  evEdge: number;
  minEvRequired: number;
  kellyFraction: number;
}

export interface PoissonPrediction {
  homeXG: number;
  awayXG: number;
  homeWinProb: number;
  drawProb: number;
  awayWinProb: number;
  over15Prob: number;
  over25Prob: number;
  over35Prob: number;
  bttsProb: number;
  topCorrectScores: CorrectScoreProb[];
  homeAttackStrength: number;
  homeDefenseStrength: number;
  awayAttackStrength: number;
  awayDefenseStrength: number;
  homeFormMultiplier: number;
  awayFormMultiplier: number;
  probabilityMatrix: number[][]; // 6x6 score matrix
  measurements?: PredictionEngineMeasurements;
  modelType?: 'DIXON_COLES_EVIDENCE_BASED';
  teamStrength?: TeamStrengthBreakdown;
  eloRatings?: EloRatingBreakdown;
  xgBreakdown?: XGBreakdown;
  tacticalContext?: TacticalContextBreakdown;
  standingsContext?: StandingsPredictionContext;
  dixonColesParams?: DixonColesParams;
  mostLikelyOutcome?: MostLikelyOutcome;
  marketOdds?: ScrapedMarketOdds;
  volatilityContext?: VolatilityCalibrationContext;
  monteCarlo?: MonteCarloSimulationSummary;
  bestValueBet?: ValueBetRecommendation;
}

export interface Fixture {
  id: string;
  providerId: string;
  league: LeagueCode | string;
  leagueName: string;
  leagueUrl?: string;
  matchDate: string;
  kickOffTime: string;
  timestamp?: number;
  homeTeam: string;
  awayTeam: string;
  homeBadge?: string;
  awayBadge?: string;
  status: 'SCHEDULED' | 'TIMED' | 'LIVE' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  prediction?: PoissonPrediction;
  markets?: MarketOption[];
  mostLikelyOutcome?: MostLikelyOutcome;
  homeStats?: TeamStatsSummary;
  awayStats?: TeamStatsSummary;
  score?: { home: number; away: number };
  minute?: number;
  measurements?: PredictionEngineMeasurements;
  stage?: string;
  resultDetails?: {
    regulationTime?: string;
    penalties?: string;
  };
  information?: {
    category: string;
    value: string;
  }[];
  statistics?: {
    category: string;
    homeValue?: string;
    awayValue?: string;
  }[];
  restDaysHome?: number;
  restDaysAway?: number;
  h2hMatches?: any[];
  homeParticipantId?: string;
  awayParticipantId?: string;
  marketOdds?: ScrapedMarketOdds;
  hasPrediction?: boolean;
  authoritativePick?: {
    key: MarketOption['key'];
    type?: '1' | 'X' | '2' | 'O2.5' | 'U2.5' | 'BTTS_Y' | 'BTTS_N' | '1X' | 'X2';
    label: string;
    shortLabel?: string;
    probability: number;
    probabilityPercent: number;
    probabilityFormatted: string;
  };
  highestPick?: {
    type: '1' | 'X' | '2' | 'O2.5' | 'U2.5' | 'BTTS_Y' | 'BTTS_N' | '1X' | 'X2';
    label: string;
    shortLabel: string;
    probability: number;
    probabilityPercent: number;
    probabilityFormatted: string;
  };
  probs?: {
    home: number;
    draw: number;
    away: number;
    over25: number;
    under25: number;
    bttsYes: number;
    bttsNo: number;
    tipProbMostLikely?: number;
    tipProbOverUnder?: number;
    tipProbBtts?: number;
    tipProb1X2?: number;
  };
  popularityScore?: number;
}

export interface LeagueGroupDTO {
  leagueKey: string;
  leagueName: string;
  subDivision?: string;
  headerKey: string;
  popularityScore: number;
  latestDateTime: number;
  fixtureIds: string[];
}

export interface SqliteGateState {
  enabled: boolean;
  initialized: boolean;
  dbExists: boolean;
  dbPath: string;
  isDevPreview: boolean;
  blockedReason: 'NOT_STARTED_MANUALLY' | 'MISSING_DB_ON_PREVIEW' | null;
}

export interface ScrapingGateState {
  enabled: boolean;
  blockedReason: 'NOT_STARTED_MANUALLY' | null;
}

export interface FixturesQueryResponse {
  success: boolean;
  sqliteBlocked?: boolean;
  sqliteGate?: SqliteGateState;
  provider: string;
  count: number;
  totalDatabaseCount: number;
  resolvedDateFilter: string;
  fixtures: Fixture[];
  groups: LeagueGroupDTO[];
}

export interface LiveFixturesResponse {
  success: boolean;
  sqliteBlocked?: boolean;
  sqliteGate?: SqliteGateState;
  provider: string;
  count: number;
  fixtures: Fixture[];
  groups: LeagueGroupDTO[];
}

export interface FeaturedTipDTO {
  fixture: Fixture;
  market: MarketOption;
  odds: number;
  hasScrapedOdds: boolean;
}

export interface FeaturedTipsResponse {
  success: boolean;
  sqliteBlocked?: boolean;
  sqliteGate?: SqliteGateState;
  count: number;
  totalOdds: number;
  tips: FeaturedTipDTO[];
}

export interface LeagueOptionDTO {
  code: string;
  name: string;
  country?: string;
  leagueUrl?: string;
}

export interface StandingsCatalogItem {
  code: string;
  name: string;
  country: string;
  leagueUrl?: string;
  hasStandings: boolean;
  teamCount: number;
  groupCount: number;
  updatedAt?: string;
  popularityScore: number;
}

export interface EngineSettings {
  rollingMatchWindow: number; // e.g. 10, 15, 20
  safeWinThreshold: number; // e.g. 0.70 (70%)
  homeAdvantageFactor: number; // default 1.15
  formDecayRate: number; // 0.85
  autoSyncDaily: boolean;
  colorTheme?: 'opta-emerald' | 'champions-crimson' | 'ballon-gold' | 'volt-lime';
  excludeVolatileLeagues?: boolean; // When true, filters out high-parity/chaotic leagues (E1, D2, Serie B, etc.)
  volatilityTemperatureAlpha?: number; // T = V_L ^ alpha (default 1.0, [0.5, 1.5])
  minEvBase?: number; // Baseline EV threshold before V_L scaling (default 0.03)
  kellyBaseFraction?: number; // Baseline fractional Kelly before 1/V_L scaling (default 0.25)
  monteCarloSigmaBase?: number; // Baseline xG shock std dev before * V_L (default 0.22)
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  rollingMatchWindow: 15,
  safeWinThreshold: 0.72,
  homeAdvantageFactor: 1.12,
  formDecayRate: 0.85,
  autoSyncDaily: true,
  excludeVolatileLeagues: true,
  volatilityTemperatureAlpha: 1.0,
  minEvBase: 0.03,
  kellyBaseFraction: 0.25,
  monteCarloSigmaBase: 0.22,
};

export function cleanFixtureId(id?: string): string {
  return String(id || '')
    .replace(/^fs_hist_/, '')
    .replace(/^fs_/, '')
    .replace(/^hist_/, '')
    .replace(/^scraped_/, '')
    .trim();
}

export interface ProviderStatus {
  id: string;
  name: string;
  type: 'CSV' | 'REST' | 'HYBRID' | 'SCRAPER';
  status: 'ONLINE' | 'STANDBY' | 'DEGRADED';
  latencyMs: number;
  description: string;
  features: string[];
}

export interface LeagueStandingEntry {
  rank: number;
  teamId?: string;
  teamName: string;
  badge?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form?: ('W' | 'D' | 'L')[];
  zoneCode?: string;
  zoneColor?: string;
  zoneLabel?: string;
}

export interface LeagueStandingGroup {
  name: string;
  table: LeagueStandingEntry[];
}

export interface LeagueStandingTable {
  leagueCode: string;
  leagueName: string;
  country?: string;
  leagueUrl?: string;
  season?: string;
  tournamentId?: string;
  updatedAt: string;
  source: 'FLASHSCORE_SCRAPED';
  table: LeagueStandingEntry[];
  groups?: LeagueStandingGroup[];
}

export interface BetSelection {
  fixtureId: string;
  homeTeam: string;
  awayTeam: string;
  leagueName: string;
  marketKey: string;
  marketName: string;
  odds: number;
  matchDate?: string;
  kickOffTime?: string;
  timestamp?: number;
  status?: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  matchStatus?: 'SCHEDULED' | 'LIVE' | 'FINISHED' | 'CANCELLED' | 'POSTPONED';
  minute?: number;
  score?: { home: number; away: number };
}

export interface SlipBet {
  id: string;
  stake: number;
  totalOdds: number;
  potentialWin: number;
  currency: 'Birr';
  status: 'PENDING' | 'WON' | 'LOST';
  selections: BetSelection[];
  placedAt: string;
  evaluatedAt?: string;
}
