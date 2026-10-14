import { APIProvider, LiveOddsUpdate, LiveScore } from './types.js';
import { Fixture, LeagueStandingTable } from '../core/types.js';
import { flashscoreScraperService } from '../services/flashscoreScraperService.js';

export class FlashscoreProvider implements APIProvider {
  id = 'FLASHSCORE' as const;
  name = 'Flashscore Live Scraper';
  type = 'SCRAPER' as const;
  description = 'Direct FlashscoreScraping engine extracting live match results, in-play statistics, worldwide fixtures, and results directly from Flashscore.';
  features = [
    'Direct Flashscore Scraper Engine',
    'Real-Time Live Scores & Minutes',
    'Full Worldwide Coverage (50+ Leagues & Cups)',
    'Head-to-Head Statistics & Results',
    'Automated SQLite Persistence',
  ];

  async getUpcomingFixtures(date?: string): Promise<Fixture[]> {
    return flashscoreScraperService.getUpcomingFixtures(date);
  }

  async getLiveOdds(fixtureId: string): Promise<LiveOddsUpdate> {
    return flashscoreScraperService.getLiveOdds(fixtureId);
  }

  async getLiveScores(): Promise<LiveScore[]> {
    return flashscoreScraperService.getLiveScores();
  }

  async syncHistoricalData(): Promise<{ success: boolean; matchesCount: number; message: string }> {
    return flashscoreScraperService.syncHistoricalData();
  }

  async getLeagueStandings(league: string): Promise<LeagueStandingTable | null> {
    return flashscoreScraperService.getLeagueStandings(league);
  }
}
