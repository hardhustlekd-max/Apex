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

export interface MarketOption {
  key: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN' | 'OVER_25' | 'UNDER_25' | 'BTTS_YES' | 'BTTS_NO' | 'DOUBLE_CHANCE_1X' | 'DOUBLE_CHANCE_X2';
  name: string;
  probability: number;
  isBanker: boolean;
  isMostLikely?: boolean;
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
    key: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';
    type?: '1' | 'X' | '2';
    label: string;
    shortLabel?: string;
    probability: number;
    probabilityPercent: number;
    probabilityFormatted: string;
  };
  highestPick?: {
    type: '1' | 'X' | '2' | 'O2.5' | 'U2.5' | 'BTTS_Y' | 'BTTS_N';
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

export interface FixturesQueryResponse {
  success: boolean;
  provider: string;
  count: number;
  totalDatabaseCount: number;
  resolvedDateFilter: string;
  fixtures: Fixture[];
  groups: LeagueGroupDTO[];
}

export interface LiveFixturesResponse {
  success: boolean;
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
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  rollingMatchWindow: 15,
  safeWinThreshold: 0.72,
  homeAdvantageFactor: 1.12,
  formDecayRate: 0.85,
  autoSyncDaily: true,
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
