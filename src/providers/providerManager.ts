import { APIProvider } from './types.js';
import { FlashscoreProvider } from './flashscoreProvider.js';
import { EngineSettings, ProviderStatus } from '../core/types.js';
import { db } from '../core/db.js';

export class ProviderManager {
  private providers: Map<string, APIProvider> = new Map();
  private activeProviderId: EngineSettings['activeProvider'] = 'FLASHSCORE';

  constructor() {
    this.registerProvider(new FlashscoreProvider());
  }

  registerProvider(provider: APIProvider): void {
    this.providers.set(provider.id, provider);
  }

  getActiveProvider(): APIProvider {
    const provider = this.providers.get('FLASHSCORE');
    if (provider) return provider;
    throw new Error('Flashscore provider not found');
  }

  setActiveProvider(providerId: EngineSettings['activeProvider']): boolean {
    if (providerId === 'FLASHSCORE') {
      this.activeProviderId = providerId;
      const settings = db.getSettings();
      if (settings) {
        settings.activeProvider = providerId;
        db.saveSettings(settings);
      }
      return true;
    }
    return false;
  }

  getAllProvidersStatus(): ProviderStatus[] {
    const list: ProviderStatus[] = [];
    for (const p of this.providers.values()) {
      list.push({
        id: p.id,
        name: p.name,
        type: p.type,
        status: 'ONLINE',
        latencyMs: 14,
        description: p.description,
        features: p.features,
      });
    }

    return list;
  }
}

export const providerManager = new ProviderManager();
