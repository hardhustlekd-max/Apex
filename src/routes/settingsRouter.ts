import { Router } from 'express';
import { db } from '../core/db.js';
import { providerManager } from '../providers/providerManager.js';
import { EngineSettings } from '../core/types.js';

export const settingsRouter = Router();

settingsRouter.get('/', (req, res) => {
  try {
    const settings = db.getSettings();
    res.json({
      success: true,
      settings: settings || {
        activeProvider: 'FLASHSCORE',
        rollingMatchWindow: 15,
        minEVThreshold: 1.10,
        safeWinThreshold: 0.72,
        homeAdvantageFactor: 1.12,
        formDecayRate: 0.85,
        autoSyncDaily: true,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to get settings' });
  }
});

settingsRouter.put('/', (req, res) => {
  try {
    const updated: Partial<EngineSettings> = req.body;
    const current = db.getSettings() || {
      activeProvider: 'FLASHSCORE',
      rollingMatchWindow: 15,
      minEVThreshold: 1.10,
      safeWinThreshold: 0.72,
      homeAdvantageFactor: 1.12,
      formDecayRate: 0.85,
      autoSyncDaily: true,
    };

    const newSettings: EngineSettings = {
      ...current,
      ...updated,
    };

    if (updated.activeProvider) {
      providerManager.setActiveProvider(updated.activeProvider);
    }

    db.saveSettings(newSettings);

    res.json({
      success: true,
      settings: newSettings,
      message: 'Engine settings updated successfully',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || 'Failed to update settings' });
  }
});
