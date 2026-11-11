import {
  Fixture,
  AccaLeg,
  AccumulatorSlip,
  EngineSettings,
  MarketOption,
} from './types.js';
import { getRelativeDateStr, getUtcDateStr, hasMatchStarted, normalizeDateStr } from './dateUtils.js';

export interface AccaGenerationParams {
  strategy: 'BANKER' | 'PROBABILITY_CHASE' | 'CUSTOM';
  legCount?: number;
  minProbability?: number;
  stake?: number;
  allowedMarkets?: MarketOption['key'][];
  dateFilter?: 'TODAY' | 'TOMORROW' | 'NEXT_3_DAYS' | 'THIS_WEEK' | 'ALL' | 'CUSTOM' | string;
  customStartDate?: string;
  customEndDate?: string;
}

/**
 * Determines whether a football match has already kicked off or finished
 */
export function isMatchStarted(f: Fixture): boolean {
  if (!f) return true;

  // 1. Status check: live, in-play, finished, or postponed matches are treated as started/unavailable
  if (f.status) {
    const s = String(f.status).toUpperCase().trim();
    if (
      s === 'LIVE' ||
      s === 'FINISHED' ||
      s === 'IN_PLAY' ||
      s === 'IN' ||
      s === 'POST' ||
      s === 'FT' ||
      s === 'HT' ||
      s === 'POSTPONED' ||
      s === 'CANCELLED' ||
      s === 'SUSPENDED' ||
      s === 'ABANDONED' ||
      s === 'AET' ||
      s === 'PEN' ||
      s === '1H' ||
      s === '2H' ||
      s === 'BREAK' ||
      s === 'INT' ||
      s === 'EXTRA_TIME' ||
      s === 'PENALTIES'
    ) {
      return true;
    }
  }

  // 2. Score check: if match already has scored goals and is not explicitly scheduled/timed
  if (f.score && (f.score.home !== undefined || f.score.away !== undefined)) {
    if ((f.score.home || 0) > 0 || (f.score.away || 0) > 0) {
      if (f.status !== 'SCHEDULED' && f.status !== 'TIMED') return true;
    }
  }

  // 3. Normalized time comparison
  return hasMatchStarted(f.matchDate, f.kickOffTime);
}


export class AccumulatorGenerator {
  /**
   * Generates an accumulator slip based on selected strategy, date range, and constraints
   */
  public static generateSlip(
    fixtures: Fixture[],
    params: AccaGenerationParams,
    settings: EngineSettings
  ): AccumulatorSlip {
    const strategy = params.strategy || 'BANKER';
    const dateFilter = params.dateFilter || 'TODAY';

    const todayStr = getRelativeDateStr(0);
    const utcTodayStr = getUtcDateStr(0);
    const tomorrowStr = getRelativeDateStr(1);
    const utcTomorrowStr = getUtcDateStr(1);
    const next3DaysStr = getRelativeDateStr(2);
    const thisWeekStr = getRelativeDateStr(6);

    // Strictly filter out any matches that have already started
    const unstartedFixtures = fixtures.filter((f) => !isMatchStarted(f));

    // Filter candidate fixtures according to the specified date filter
    let candidateFixtures = unstartedFixtures.filter((f) => {
      const matchDateNorm = normalizeDateStr(f.matchDate);
      if (dateFilter === 'TODAY') {
        return matchDateNorm === todayStr || matchDateNorm === utcTodayStr;
      } else if (dateFilter === 'TOMORROW') {
        return matchDateNorm === tomorrowStr || matchDateNorm === utcTomorrowStr;
      } else if (dateFilter === 'NEXT_3_DAYS') {
        const minDate = todayStr < utcTodayStr ? todayStr : utcTodayStr;
        return matchDateNorm >= minDate && matchDateNorm <= next3DaysStr;
      } else if (dateFilter === 'THIS_WEEK') {
        const minDate = todayStr < utcTodayStr ? todayStr : utcTodayStr;
        return matchDateNorm >= minDate && matchDateNorm <= thisWeekStr;
      } else if (dateFilter === 'CUSTOM') {
        if (params.customStartDate && matchDateNorm < normalizeDateStr(params.customStartDate)) return false;
        if (params.customEndDate && matchDateNorm > normalizeDateStr(params.customEndDate)) return false;
        return true;
      }
      return true; // ALL
    });

    const targetLegCount = params.legCount || (strategy === 'BANKER' ? 3 : 4);

    // If matches within filtered date are fewer than required legs,
    // top up from the nearest upcoming unstarted matches
    if (candidateFixtures.length < targetLegCount) {
      const additionalFixtures = unstartedFixtures
        .filter((f) => !candidateFixtures.some((c) => c.id === f.id))
        .sort((a, b) => a.matchDate.localeCompare(b.matchDate) || a.kickOffTime.localeCompare(b.kickOffTime));
      candidateFixtures = [...candidateFixtures, ...additionalFixtures];
    }

    let availableLegs = this.extractAllCandidateLegs(candidateFixtures, params.allowedMarkets);

    let selectedLegs: AccaLeg[] = [];
    let slipName = '';

    const isToday = dateFilter === 'TODAY';

    if (strategy === 'BANKER') {
      const minProb = params.minProbability || settings.safeWinThreshold || 0.70;
      const legCount = targetLegCount;
      slipName = isToday ? "🛡️ Today's Banker (High Safety)" : '🛡️ The Banker (High Safety)';

      // Filter for candidate legs >= minProb
      const bankers = availableLegs
        .filter((leg) => leg.probability >= minProb)
        .sort((a, b) => b.probability - a.probability);

      selectedLegs = this.pickDistinctMatchLegs(bankers, legCount);

      // Fallback if not enough strictly > minProb
      if (selectedLegs.length < legCount) {
        const remaining = availableLegs
          .filter((l) => !selectedLegs.some((s) => s.fixtureId === l.fixtureId))
          .sort((a, b) => b.probability - a.probability);
        const needed = legCount - selectedLegs.length;
        selectedLegs.push(...this.pickDistinctMatchLegs(remaining, needed));
      }
    } else if (strategy === 'PROBABILITY_CHASE') {
      const legCount = targetLegCount;
      slipName = isToday
        ? `🔥 Today's ${legCount}-Fold Probability Slip`
        : '⚡ The Probability Chase';

      const bestLegs = availableLegs
        .sort((a, b) => b.probability - a.probability);

      selectedLegs = this.pickDistinctMatchLegs(bestLegs, legCount);
    } else {
      // CUSTOM Multi-leg
      const legCount = targetLegCount;
      const minProb = params.minProbability || 0.50;
      slipName = isToday
        ? `🎯 Today's Custom Acca (${legCount}-Fold)`
        : `🎯 Custom Acca (${legCount}-Fold)`;

      const qualifiedLegs = availableLegs
        .filter((leg) => leg.probability >= minProb)
        .sort((a, b) => b.probability - a.probability);
      selectedLegs = this.pickDistinctMatchLegs(qualifiedLegs, legCount);
    }

    // Calculate Multiplied Combined Probability
    let combinedProb = 1.0;
    for (const leg of selectedLegs) {
      combinedProb *= leg.probability;
    }
    combinedProb = Number(combinedProb.toFixed(4));

    // Determine Risk Rating
    let riskRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' = 'MEDIUM';
    if (combinedProb >= 0.40) riskRating = 'LOW';
    else if (combinedProb >= 0.20) riskRating = 'MEDIUM';
    else if (combinedProb >= 0.05) riskRating = 'HIGH';
    else riskRating = 'EXTREME';

    const slipId = `slip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();

    const summaryText = this.buildSummaryText(
      slipName,
      strategy,
      selectedLegs,
      combinedProb,
      0, // EV removed
      0  // Stake removed from summary calc
    );

    return {
      id: slipId,
      name: slipName,
      strategy: strategy as any,
      legs: selectedLegs,
      combinedProb,
      overallEV: 0,
      suggestedStake: 0,
      stake: 0,
      riskRating,
      createdAt,
      summaryText,
    };
  }

  /**
   * Extracts every possible betting market candidate leg across all fixtures
   */
  private static extractAllCandidateLegs(
    fixtures: Fixture[],
    allowedMarkets?: MarketOption['key'][]
  ): AccaLeg[] {
    const legs: AccaLeg[] = [];

    for (const f of fixtures) {
      if (!f.markets || !f.prediction || isMatchStarted(f)) continue;

      for (const m of f.markets) {
        if (allowedMarkets && allowedMarkets.length > 0 && !allowedMarkets.includes(m.key)) {
          continue;
        }

        let selection = m.name;
        let reasoning = '';

        if (m.key === 'HOME_WIN') {
          selection = `${f.homeTeam} to Win`;
          reasoning = `AI predicts ${(m.probability * 100).toFixed(1)}% win prob (xG: ${f.prediction.homeXG} vs ${f.prediction.awayXG})`;
        } else if (m.key === 'AWAY_WIN') {
          selection = `${f.awayTeam} to Win`;
          reasoning = `AI predicts ${(m.probability * 100).toFixed(1)}% win prob (xG: ${f.prediction.awayXG} vs ${f.prediction.homeXG})`;
        } else if (m.key === 'DRAW') {
          selection = 'Draw (X)';
          reasoning = `High draw probability ${(m.probability * 100).toFixed(1)}% with balanced attack/defense ratings`;
        } else if (m.key === 'OVER_25') {
          selection = 'Over 2.5 Total Goals';
          reasoning = `Combined expected goals ${(f.prediction.homeXG + f.prediction.awayXG).toFixed(2)} exceeds 2.5 barrier`;
        } else if (m.key === 'UNDER_25') {
          selection = 'Under 2.5 Total Goals';
          reasoning = `Defensive resilience indicates low scoring match (${(m.probability * 100).toFixed(1)}% under 2.5)`;
        } else if (m.key === 'BTTS_YES') {
          selection = 'Both Teams To Score - Yes';
          reasoning = `Both teams feature high scoring rate with ${(m.probability * 100).toFixed(1)}% BTTS prob`;
        } else if (m.key === 'BTTS_NO') {
          selection = 'Both Teams To Score - No';
          reasoning = `Clean sheet probability high for defensive unit`;
        } else if (m.key === 'DOUBLE_CHANCE_1X') {
          selection = `${f.homeTeam} or Draw (1X)`;
          reasoning = `Home advantage safety floor ${(m.probability * 100).toFixed(1)}%`;
        } else if (m.key === 'DOUBLE_CHANCE_X2') {
          selection = `Draw or ${f.awayTeam} (X2)`;
          reasoning = `Away double chance confidence ${(m.probability * 100).toFixed(1)}%`;
        }

        legs.push({
          fixtureId: f.id,
          fixtureDate: f.matchDate,
          league: f.leagueName,
          homeTeam: f.homeTeam,
          awayTeam: f.awayTeam,
          marketKey: m.key,
          marketName: m.name,
          selection,
          probability: m.probability,
          expectedValue: 0,
          reasoning,
          isBanker: m.isBanker,
          isPositiveEV: false,
        });
      }
    }

    return legs;
  }

  /**
   * Helper to ensure only 1 leg is picked per match/fixture
   */
  private static pickDistinctMatchLegs(candidates: AccaLeg[], maxCount: number): AccaLeg[] {
    const picked: AccaLeg[] = [];
    const usedFixtures = new Set<string>();

    for (const leg of candidates) {
      if (picked.length >= maxCount) break;
      if (!usedFixtures.has(leg.fixtureId)) {
        usedFixtures.add(leg.fixtureId);
        picked.push(leg);
      }
    }

    return picked;
  }

  /**
   * Builds formatted bet slip text for copy-to-clipboard
   */
  private static buildSummaryText(
    slipName: string,
    strategy: string,
    legs: AccaLeg[],
    winProb: number,
    overallEV: number,
    stake: number
  ): string {
    const legLines = legs
      .map(
        (l, i) =>
          `${i + 1}. [${l.league}] ${l.homeTeam} vs ${l.awayTeam}\n   Selection: ${l.selection} (AI: ${(l.probability * 100).toFixed(1)}%)`
      )
      .join('\n\n');

    return `════════════════════════════════════
🎯 FOOTBALL PREDICTION SLIP
════════════════════════════════════
Type: ${slipName}
Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}

SELECTIONS (${legs.length} LEGS):
${legLines}

────────────────────────────────────
Model Probability: ${(winProb * 100).toFixed(2)}%
════════════════════════════════════
Powered by Poisson Statistical AI Engine`;
  }
}
