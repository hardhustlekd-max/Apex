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
