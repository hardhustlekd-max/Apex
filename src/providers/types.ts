import { Fixture, BookmakerOdds, HistoricalMatch, LeagueStandingTable } from '../core/types.js';

export interface LiveScore {
  fixtureId: string;
  league?: string;
  leagueName?: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: number;
  status: 'FIRST_HALF' | 'HALF_TIME' | 'SECOND_HALF' | 'EXTRA_TIME' | 'FINISHED';
  events?: { minute: number; type: 'GOAL' | 'CARD' | 'VAR'; team: string; player?: string }[];
}

export interface LiveOddsUpdate {
  fixtureId: string;
  timestamp: string;
  odds: BookmakerOdds;
  movement: 'UP' | 'DOWN' | 'STABLE';
}

export interface APIProvider {
  id: 'FLASHSCORE' | 'ESPN' | 'FOOTBALL_DATA_CO_UK' | 'BIG_BALLS_DATA' | 'FOOTBALL_DATA_ORG' | 'API_FOOTBALL';
  name: string;
  type: 'CSV' | 'REST' | 'HYBRID' | 'SCRAPER';
  description: string;
  features: string[];

  getUpcomingFixtures(date?: string): Promise<Fixture[]>;
  getLiveOdds(fixtureId: string): Promise<LiveOddsUpdate>;
  getLiveScores(): Promise<LiveScore[]>;
  syncHistoricalData(daysBack?: number, shouldClear?: boolean): Promise<{ success: boolean; matchesCount: number; message: string }>;
  getLeagueStandings?(league: string): Promise<LeagueStandingTable | null>;
}
