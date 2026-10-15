import { flashscoreScraperService } from './flashscoreScraperService.js';
import { EngineService } from './engineService.js';
import { loggerService } from './loggerService.js';

export type SyncPhase = 'IDLE' | 'SCRAPING' | 'PREDICTING' | 'INITIALIZING' | 'READY';

export class SyncCoordinator {
  private static phase: SyncPhase = 'IDLE';

  static getPhase(): SyncPhase {
    return this.phase;
  }

  static async runPhasedSync(
    onProgress: (phase: SyncPhase, progress: number, message: string) => void
  ): Promise<void> {
    try {
      // Phase 1: Scrape
      this.phase = 'SCRAPING';
      onProgress('SCRAPING', 10, 'Initializing scraper...');
      await flashscoreScraperService.syncHistoricalData(7);
      onProgress('SCRAPING', 40, 'Raw data persisted.');

      // Phase 2: Predict
      this.phase = 'PREDICTING';
      onProgress('PREDICTING', 50, 'Running prediction engine...');
      // Logic for predicting based on fresh data
      await EngineService.predictAndStoreAll(); 
      onProgress('PREDICTING', 80, 'Predictions updated.');

      // Phase 3: Init UI
      this.phase = 'INITIALIZING';
      onProgress('INITIALIZING', 90, 'Initializing UI components...');
      // Final UI data load logic
      
      this.phase = 'READY';
      onProgress('READY', 100, 'Synchronization complete.');
    } catch (err: any) {
      this.phase = 'IDLE';
      loggerService.addLog({
        level: 'ERROR',
        category: 'ENGINE',
        source: 'SyncCoordinator',
        message: `Sync failed at phase ${this.phase}: ${err?.message}`,
      });
      throw err;
    }
  }
}
