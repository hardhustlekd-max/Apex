import { GoogleGenAI } from '@google/genai';
import { FootballTipItem, GroundingSource, TrendingTipsData } from '../core/types.js';

export class GeminiSearchService {
  private static rateLimitCooldownUntil = 0;
  private static inMemoryCache: TrendingTipsData | null = null;

  private static getAIClient(): GoogleGenAI {
    return new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  /**
   * Fetches today's trending football analysis and top headlines using Google Search Grounding with Gemini 3.8 Flash
   */
  public static async fetchTrendingFootballAnalysis(forceRefresh = false): Promise<TrendingTipsData> {
    const todayStr = new Date().toISOString().split('T')[0];
    const now = Date.now();

    // If we hit a 429 quota exhaustion recently, respect cooldown to prevent error loops
    if (!forceRefresh && this.rateLimitCooldownUntil > now && this.inMemoryCache) {
      return {
        ...this.inMemoryCache,
        quotaNotice: 'Quota cooldown active — serving cached analysis.',
      };
    }

    const prompt = `You are an elite European football data analyst, tactical scout, and betting specialist.
Use Google Search to fetch today's trending football news, expert match analyses, betting tips, and top headlines.
Today's date is ${todayStr}.

Please search for and provide:
1. TOP TRENDING HEADLINES & BREAKING NEWS: Managerial news, key club developments, UEFA Champions League / European competitions / Premier League / La Liga / Serie A / Bundesliga hot stories.
2. TODAY & UPCOMING MATCH ANALYSIS & EXPERT TIPS: Detailed predictions and betting value picks for today's and upcoming highlighted fixtures (e.g. 1X2 pick, Over/Under 2.5, Both Teams to Score (BTTS), with odds indication and tactical/statistical reasoning).
3. KEY TEAM NEWS & INJURY ALERTS: Crucial player absences, returns from injury, suspensions, and tactical shifts.
4. BEST VALUE BETTING PICKS: 3-5 high-conviction value selections with expected outcome, recommended market, and rationale.

Write a clean, rich, and well-structured markdown summary with bullet points, emojis, bold match names, and clear prediction tags.`;

    try {
      const ai = this.getAIClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const rawMarkdown = response.text || '';

      // Extract Grounding Chunks (URLs and titles)
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources: GroundingSource[] = [];
      const seenUrls = new Set<string>();

      for (const chunk of groundingChunks) {
        if (chunk.web && chunk.web.uri && chunk.web.title) {
          if (!seenUrls.has(chunk.web.uri)) {
            seenUrls.add(chunk.web.uri);
            sources.push({
              title: chunk.web.title,
              url: chunk.web.uri,
            });
          }
        }
      }

      // Parse structured tip cards from markdown or generate categorized items
      const tips = this.parseTipsFromMarkdown(rawMarkdown, sources);

      // Extract headline summary
      const headlineSummary = this.extractHeadlineSummary(rawMarkdown);

      const result: TrendingTipsData = {
        lastUpdated: new Date().toISOString(),
        headlineSummary,
        rawAnalysisMarkdown: rawMarkdown,
        tips,
        groundingSources: sources,
        isRealGrounding: true,
      };

      this.inMemoryCache = result;
      this.rateLimitCooldownUntil = 0; // Clear cooldown on success
      return result;
    } catch (err: any) {
      const is429 =
        err?.status === 429 ||
        err?.message?.includes('429') ||
        err?.message?.includes('RESOURCE_EXHAUSTED') ||
        err?.message?.includes('quota');

      if (is429) {
        console.warn(
          '[GeminiSearchService] Gemini API quota limit reached (429 RESOURCE_EXHAUSTED). Entering 2-minute cooldown.'
        );
        this.rateLimitCooldownUntil = Date.now() + 2 * 60 * 1000;
      } else {
        console.warn('[GeminiSearchService] Gemini Search grounding issue:', err?.message || err);
      }

      // If we have an existing in-memory cache, return it with a notice
      if (this.inMemoryCache) {
        return {
          ...this.inMemoryCache,
          quotaNotice: is429
            ? 'API quota limit reached on free tier. Upgrading API key in Settings > Secrets increases quota.'
            : undefined,
        };
      }

      // Fallback with rich curated default analysis
      const fallback = this.getFallbackTipsData(
        todayStr,
        is429
          ? 'API quota limit reached on free tier. Upgrading API key in Settings > Secrets increases quota.'
          : err?.message || 'Gemini Search grounding API unavailable'
      );
      this.inMemoryCache = fallback;
      return fallback;
    }
  }

  private static extractHeadlineSummary(markdown: string): string {
    const lines = markdown.split('\n').filter((l) => l.trim().length > 0);
    for (const line of lines) {
      const clean = line.replace(/^[#*-\s]+/, '').trim();
      if (clean.length > 25 && !clean.toLowerCase().startsWith('here') && !clean.toLowerCase().startsWith('you are')) {
        return clean;
      }
    }
    return "Today's top European football headlines, matchday tactical previews, and high-probability betting tips.";
  }

  private static parseTipsFromMarkdown(markdown: string, sources: GroundingSource[]): FootballTipItem[] {
    const items: FootballTipItem[] = [];
    const lines = markdown.split('\n');
    let currentCategory: FootballTipItem['category'] = 'HEADLINE';
    let currentTitle = '';
    let currentAnalysis: string[] = [];
    let currentPrediction = '';
    let currentOdds = '';
    let currentMatch = '';
    let currentLeague = '';
    let itemIndex = 1;

    const commitCurrent = () => {
      if (currentTitle && currentAnalysis.length > 0) {
        const matchingSource = sources[itemIndex % (sources.length || 1)];
        items.push({
          id: `tip_${itemIndex++}`,
          category: currentCategory,
          title: currentTitle.replace(/^[#*-\s]+/, '').trim(),
          match: currentMatch || undefined,
          league: currentLeague || undefined,
          predictionOrTip: currentPrediction || undefined,
          confidenceOrOdds: currentOdds || undefined,
          analysis: currentAnalysis.join('\n').trim(),
          sourceTitle: matchingSource?.title,
          sourceUrl: matchingSource?.url,
        });
        currentTitle = '';
        currentAnalysis = [];
        currentPrediction = '';
        currentOdds = '';
        currentMatch = '';
        currentLeague = '';
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const lower = trimmed.toLowerCase();
      if (lower.includes('headline') || lower.includes('breaking news')) {
        commitCurrent();
        currentCategory = 'HEADLINE';
        continue;
      } else if (lower.includes('match') || lower.includes('preview') || lower.includes('fixture')) {
        commitCurrent();
        currentCategory = 'MATCH_PREVIEW';
        continue;
      } else if (lower.includes('betting') || lower.includes('tips') || lower.includes('pick') || lower.includes('value')) {
        commitCurrent();
        currentCategory = 'BETTING_TIP';
        continue;
      } else if (lower.includes('injury') || lower.includes('team news') || lower.includes('squad')) {
        commitCurrent();
        currentCategory = 'INJURY_TEAM_NEWS';
        continue;
      }

      // Check if it's a section item header (### or **Item:** or - **...)
      if (trimmed.startsWith('###') || (trimmed.startsWith('- **') && trimmed.includes(':')) || trimmed.startsWith('**Match:')) {
        commitCurrent();
        currentTitle = trimmed.replace(/^###\s*/, '').replace(/^-\s*\*\*/, '').replace(/\*\*.*$/, '').replace(/[*#]/g, '').trim();
        if (!currentTitle) currentTitle = trimmed.replace(/[*#]/g, '').trim();

        // Check for match detection
        if (currentTitle.includes(' vs ') || currentTitle.includes(' v ')) {
          currentMatch = currentTitle;
        }
        continue;
      }

      // Check for predictions or odds inside text
      if (trimmed.toLowerCase().includes('prediction:') || trimmed.toLowerCase().includes('tip:')) {
        currentPrediction = trimmed.split(/prediction:|tip:/i)[1]?.trim() || '';
      } else if (trimmed.toLowerCase().includes('odds:') || trimmed.toLowerCase().includes('confidence:')) {
        currentOdds = trimmed.split(/odds:|confidence:/i)[1]?.trim() || '';
      }

      if (currentTitle) {
        currentAnalysis.push(trimmed);
      } else {
        // First top level paragraphs
        if (items.length === 0 && !currentTitle) {
          currentTitle = 'Trending Football Overview';
          currentAnalysis.push(trimmed);
        }
      }
    }

    commitCurrent();

    return items;
  }

  private static getFallbackTipsData(todayStr: string, quotaNotice?: string): TrendingTipsData {
    return {
      lastUpdated: new Date().toISOString(),
      headlineSummary: "Live Google Search grounded analysis currently unavailable.",
      rawAnalysisMarkdown: `### European Football Analysis (${todayStr})\nNo live analysis stream available at this moment.`,
      tips: [],
      groundingSources: [],
      isRealGrounding: false,
      quotaNotice,
    };
  }
}
