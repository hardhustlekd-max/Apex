import { db } from './db.js';
import { parseFeedText, ScrapedRawMatch } from './feedParser.js';

export class OnDemandParser {
  public static async getParsedMatch(fixtureId: string): Promise<ScrapedRawMatch | null> {
    const rawData = db.getRawFeed(fixtureId);
    if (!rawData) return null;

    const matches = parseFeedText(rawData.rawText);
    const cleanId = fixtureId.replace(/^fs_/, '').trim();
    
    return matches.find((m) => m.matchId === cleanId) || null;
  }
}
