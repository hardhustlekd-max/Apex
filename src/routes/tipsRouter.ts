import { Router } from 'express';
import { GeminiSearchService } from '../services/geminiSearchService.js';
import { db } from '../core/db.js';
import { TrendingTipsData } from '../core/types.js';

export const tipsRouter = Router();

/**
 * GET /api/tips
 * Returns today's trending football tips & headlines, checking cache first
 */
tipsRouter.get('/', async (req, res) => {
  try {
    const cached = db.getLatestTipsCache();
    if (cached) {
      const cacheTime = new Date(cached.updatedAt).getTime();
      const now = Date.now();
      const ageMinutes = (now - cacheTime) / (1000 * 60);

      // Return cached if younger than 60 minutes
      if (ageMinutes < 60) {
        const parsedTips = JSON.parse(cached.tipsJson);
        const parsedSources = JSON.parse(cached.sourcesJson);

        const data: TrendingTipsData = {
          lastUpdated: cached.updatedAt,
          headlineSummary: cached.headlineSummary,
          rawAnalysisMarkdown: cached.rawMarkdown,
          tips: parsedTips,
          groundingSources: parsedSources,
          isRealGrounding: true,
        };

        return res.json({
          success: true,
          fromCache: true,
          data,
        });
      }
    }

    // Otherwise fetch fresh from Google Search Grounding
    const freshData = await GeminiSearchService.fetchTrendingFootballAnalysis(false);

    // Cache in DB
    db.saveTipsCache(
      JSON.stringify(freshData.tips),
      freshData.headlineSummary,
      freshData.rawAnalysisMarkdown,
      JSON.stringify(freshData.groundingSources)
    );

    res.json({
      success: true,
      fromCache: false,
      data: freshData,
    });
  } catch (err: any) {
    console.warn('Handling /api/tips with fallback:', err?.message || err);

    // If DB has any existing cache, return it safely
    const cached = db.getLatestTipsCache();
    if (cached) {
      const parsedTips = JSON.parse(cached.tipsJson);
      const parsedSources = JSON.parse(cached.sourcesJson);

      return res.json({
        success: true,
        fromCache: true,
        data: {
          lastUpdated: cached.updatedAt,
          headlineSummary: cached.headlineSummary,
          rawAnalysisMarkdown: cached.rawMarkdown,
          tips: parsedTips,
          groundingSources: parsedSources,
          isRealGrounding: true,
        },
      });
    }

    // Default fallback
    const fallback = await GeminiSearchService.fetchTrendingFootballAnalysis(false);
    res.json({
      success: true,
      fromCache: false,
      data: fallback,
    });
  }
});

/**
 * POST /api/tips/refresh
 * Forces a live Google Search grounded update
 */
tipsRouter.post('/refresh', async (req, res) => {
  try {
    const freshData = await GeminiSearchService.fetchTrendingFootballAnalysis(true);

    // Cache in DB
    db.saveTipsCache(
      JSON.stringify(freshData.tips),
      freshData.headlineSummary,
      freshData.rawAnalysisMarkdown,
      JSON.stringify(freshData.groundingSources)
    );

    res.json({
      success: true,
      data: freshData,
    });
  } catch (err: any) {
    console.warn('Handling /api/tips/refresh with fallback:', err?.message || err);
    const fallback = await GeminiSearchService.fetchTrendingFootballAnalysis(false);
    res.json({
      success: true,
      data: fallback,
    });
  }
});
