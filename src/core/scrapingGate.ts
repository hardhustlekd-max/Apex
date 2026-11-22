export interface ScrapingGateState {
  enabled: boolean;
  blockedReason: 'NOT_STARTED_MANUALLY' | null;
}

let scrapingManualEnabled = false;

export function isScrapingEnabled(): boolean {
  return scrapingManualEnabled;
}

export function getScrapingGateState(): ScrapingGateState {
  return {
    enabled: scrapingManualEnabled,
    blockedReason: scrapingManualEnabled ? null : 'NOT_STARTED_MANUALLY',
  };
}

export function enableScrapingManually(): ScrapingGateState {
  scrapingManualEnabled = true;
  return getScrapingGateState();
}

export function disableScrapingManually(): ScrapingGateState {
  scrapingManualEnabled = false;
  return getScrapingGateState();
}
