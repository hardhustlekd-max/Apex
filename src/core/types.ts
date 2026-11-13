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

// BookmakerOdds removed as per user request to eliminate odds-related logic

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
  dixonColesParams?: DixonColesParams;
  mostLikelyOutcome?: MostLikelyOutcome;
}

export interface Fixture {
  id: string;
  providerId: string;
  league: LeagueCode | string;
  leagueName: string;
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
}

export interface AccaLeg {
  fixtureId: string;
  fixtureDate: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  marketKey: MarketOption['key'];
  marketName: string;
  selection: string;
  probability: number;
  reasoning: string;
  isBanker: boolean;
}

export interface AccumulatorSlip {
  id: string;
  name: string;
  strategy: 'BANKER' | 'PROBABILITY_CHASE' | 'CUSTOM';
  legs: AccaLeg[];
  combinedProb: number;
  riskRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  createdAt: string;
  summaryText: string;
}

export interface EngineSettings {
  rollingMatchWindow: number; // e.g. 10, 15, 20
  safeWinThreshold: number; // e.g. 0.70 (70%)
  homeAdvantageFactor: number; // default 1.15
  formDecayRate: number; // 0.85
  autoSyncDaily: boolean;
  colorTheme?: 'opta-emerald' | 'champions-crimson' | 'ballon-gold' | 'volt-lime';
}

export interface FlashscoreScrapedMatch {
  matchId: string;
  stage?: string;
  date: string;
  status: string;
  country?: string;
  leagueName?: string;
  home: {
    name: string;
    image?: string;
  };
  away: {
    name: string;
    image?: string;
  };
  result?: {
    home?: string;
    away?: string;
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

export interface GroundingSource {
  title: string;
  url: string;
}

export interface FootballTipItem {
  id: string;
  category: 'HEADLINE' | 'MATCH_PREVIEW' | 'BETTING_TIP' | 'INJURY_TEAM_NEWS';
  title: string;
  match?: string;
  league?: string;
  predictionOrTip?: string;
  confidence?: string;
  analysis: string;
  keyPoints?: string[];
  sourceTitle?: string;
  sourceUrl?: string;
}

export interface TrendingTipsData {
  lastUpdated: string;
  headlineSummary: string;
  rawAnalysisMarkdown: string;
  tips: FootballTipItem[];
  groundingSources: GroundingSource[];
  isRealGrounding: boolean;
  quotaNotice?: string;
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
}

export interface LeagueStandingTable {
  leagueCode: string;
  leagueName: string;
  country?: string;
  season?: string;
  tournamentId?: string;
  updatedAt: string;
  source: 'FLASHSCORE_SCRAPED';
  table: LeagueStandingEntry[];
}
