import {
  Fixture,
  AccaLeg,
  AccumulatorSlip,
  EngineSettings,
  MarketOption,
} from './types.js';
import { getRelativeDateStr } from './seedData.js';

export interface AccaGenerationParams {
  strategy: 'BANKER' | 'VALUE_HUNTER' | 'CUSTOM';
  targetOdds?: number;
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
    if (s !== 'SCHEDULED' && s !== 'TIMED' && s !== 'NS' && s !== 'NOT_STARTED' && s !== 'UPCOMING') {
      return true;
    }
  }

  // 2. Score check: if match already has scored goals and is not explicitly scheduled/timed
  if (f.score && (f.score.home !== undefined || f.score.away !== undefined)) {
    if (f.status !== 'SCHEDULED' && f.status !== 'TIMED') {
      return true;
    }
    if ((f.score.home || 0) > 0 || (f.score.away || 0) > 0) {
      return true;
    }
  }

  const now = new Date();
  const nowMs = now.getTime();

  // 3. Full ISO date or timestamp check
  if (f.matchDate && (f.matchDate.includes('T') || f.matchDate.includes('Z'))) {
    const parsedTime = Date.parse(f.matchDate);
    if (!isNaN(parsedTime) && parsedTime <= nowMs) {
      return true;
    }
  }

  const cleanDate = f.matchDate ? f.matchDate.substring(0, 10) : '';
  const todayStr = getRelativeDateStr(0);

  const utcYear = now.getUTCFullYear();
  const utcMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
  const utcDay = String(now.getUTCDate()).padStart(2, '0');
  const utcTodayStr = `${utcYear}-${utcMonth}-${utcDay}`;

  // 4. Past date check (either local or UTC)
  if (cleanDate && (cleanDate < todayStr && cleanDate < utcTodayStr)) {
    return true;
  }

  // 5. Kickoff time check for today
  if (cleanDate && (cleanDate === todayStr || cleanDate === utcTodayStr) && f.kickOffTime) {
    const timeMatch = f.kickOffTime.trim().match(/^(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      let kHours = parseInt(timeMatch[1], 10);
      const kMinutes = parseInt(timeMatch[2], 10);
      if (f.kickOffTime.toLowerCase().includes('pm') && kHours < 12) kHours += 12;
      if (f.kickOffTime.toLowerCase().includes('am') && kHours === 12) kHours = 0;

      const currentLocalMins = now.getHours() * 60 + now.getMinutes();
      const currentUtcMins = now.getUTCHours() * 60 + now.getUTCMinutes();
      const kickOffMins = kHours * 60 + kMinutes;

      if (cleanDate === todayStr && kickOffMins <= currentLocalMins) {
        return true;
      }
      if (cleanDate === utcTodayStr && kickOffMins <= currentUtcMins) {
        return true;
      }
    }
  }

  return false;
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
    const stake = params.stake && params.stake > 0 ? params.stake : 10;
    const strategy = params.strategy || 'BANKER';
    const dateFilter = params.dateFilter || 'TODAY';

    const todayStr = getRelativeDateStr(0);
    const tomorrowStr = getRelativeDateStr(1);
    const next3DaysStr = getRelativeDateStr(2);
    const thisWeekStr = getRelativeDateStr(6);

    // Strictly filter out any matches that have already started
    const unstartedFixtures = fixtures.filter((f) => !isMatchStarted(f));

    // Filter candidate fixtures according to the specified date filter
    let candidateFixtures = unstartedFixtures.filter((f) => {
      if (dateFilter === 'TODAY') {
        return f.matchDate === todayStr;
      } else if (dateFilter === 'TOMORROW') {
        return f.matchDate === tomorrowStr;
      } else if (dateFilter === 'NEXT_3_DAYS') {
        return f.matchDate >= todayStr && f.matchDate <= next3DaysStr;
      } else if (dateFilter === 'THIS_WEEK') {
        return f.matchDate >= todayStr && f.matchDate <= thisWeekStr;
      } else if (dateFilter === 'CUSTOM') {
        if (params.customStartDate && f.matchDate < params.customStartDate) return false;
        if (params.customEndDate && f.matchDate > params.customEndDate) return false;
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
    } else if (strategy === 'VALUE_HUNTER') {
      const minEV = settings.minEVThreshold || 1.10;
      const legCount = targetLegCount;
      slipName = isToday
        ? (legCount >= 8 ? `🔥 Today's ${legCount}-Fold Value Slip` : "⚡ Today's Value Hunter (+EV Edge)")
        : '⚡ The Value Hunter (+EV Edge)';

      // Filter for legs with positive EV (prob * odds >= minEV)
      const valueLegs = availableLegs
        .filter((leg) => (leg.probability * leg.odds) >= minEV)
        .sort((a, b) => b.expectedValue - a.expectedValue);

      selectedLegs = this.pickDistinctMatchLegs(valueLegs, legCount);

      // Fallback if not enough > 1.10 EV
      if (selectedLegs.length < legCount) {
        const remaining = availableLegs
          .filter((l) => !selectedLegs.some((s) => s.fixtureId === l.fixtureId))
          .sort((a, b) => b.expectedValue - a.expectedValue);
        const needed = legCount - selectedLegs.length;
        selectedLegs.push(...this.pickDistinctMatchLegs(remaining, needed));
      }
    } else {
      // CUSTOM Multi-leg with Target Odds & Constraints
      const targetOdds = params.targetOdds || 10.0;
      const legCount = targetLegCount;
      const minProb = params.minProbability || 0.50;
      slipName = isToday
        ? `🎯 Today's Custom Acca (${legCount}-Fold ~${targetOdds}x)`
        : `🎯 Custom Target Acca (${legCount}-Fold ~${targetOdds}x)`;

      const qualifiedLegs = availableLegs.filter((leg) => leg.probability >= minProb);
      selectedLegs = this.optimizeCustomSlip(qualifiedLegs, legCount, targetOdds);
    }

    // Calculate Multiplied Combined Odds & Probability
    let combinedOdds = 1.0;
    let combinedProb = 1.0;

    for (const leg of selectedLegs) {
      combinedOdds *= leg.odds;
      combinedProb *= leg.probability;
    }

    combinedOdds = Number(combinedOdds.toFixed(2));
    combinedProb = Number(combinedProb.toFixed(4));
    const overallEV = Number(((combinedProb * combinedOdds) - 1.0).toFixed(3));

    const potentialPayout = Number((stake * combinedOdds).toFixed(2));
    const potentialProfit = Number((potentialPayout - stake).toFixed(2));

    // Determine Risk Rating
    let riskRating: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME' = 'MEDIUM';
    if (combinedOdds <= 3.5 && combinedProb >= 0.40) riskRating = 'LOW';
    else if (combinedOdds <= 8.0 && combinedProb >= 0.20) riskRating = 'MEDIUM';
    else if (combinedOdds <= 25.0) riskRating = 'HIGH';
    else riskRating = 'EXTREME';

    const slipId = `slip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();

    const summaryText = this.buildSummaryText(
      slipName,
      strategy,
      selectedLegs,
      combinedOdds,
      combinedProb,
      overallEV,
      stake,
      potentialPayout
    );

    return {
      id: slipId,
      name: slipName,
      strategy,
      legs: selectedLegs,
      combinedOdds,
      combinedProb,
      overallEV,
      suggestedStake: strategy === 'BANKER' ? 25 : strategy === 'VALUE_HUNTER' ? 10 : 5,
      stake,
      potentialPayout,
      potentialProfit,
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
          odds: m.odds,
          probability: m.probability,
          expectedValue: m.expectedValue,
          reasoning,
          isBanker: m.isBanker,
          isPositiveEV: m.isPositiveEV,
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
   * Custom Acca combinatorial search optimizer to find combination matching target odds
   */
  private static optimizeCustomSlip(
    candidates: AccaLeg[],
    k: number,
    targetOdds: number
  ): AccaLeg[] {
    // Group candidate legs by fixture to pick at most 1 per match
    const fixtureMap = new Map<string, AccaLeg[]>();
    for (const leg of candidates) {
      if (!fixtureMap.has(leg.fixtureId)) fixtureMap.set(leg.fixtureId, []);
      fixtureMap.get(leg.fixtureId)!.push(leg);
    }

    const distinctFixtures = Array.from(fixtureMap.values());
    if (distinctFixtures.length < k) {
      return this.pickDistinctMatchLegs(candidates, k);
    }

    // Prioritize fixtures by highest expected value and probability to keep search fast
    const prioritizedFixtures = distinctFixtures
      .map((legs) => [...legs].sort((a, b) => (b.expectedValue + b.probability) - (a.expectedValue + a.probability)))
      .sort((a, b) => ((b[0]?.expectedValue || 0) + (b[0]?.probability || 0)) - ((a[0]?.expectedValue || 0) + (a[0]?.probability || 0)))
      .slice(0, 10);

    // Limit to top 2 selections per fixture to avoid exponential explosion
    const simplifiedFixtures = prioritizedFixtures.map((legs) => legs.slice(0, 2));

    let bestCombination: AccaLeg[] = [];
    let bestScore = -Infinity;
    let evalCount = 0;
    const MAX_EVALUATIONS = 400;

    // Fast bounded recursive search
    const search = (
      fIdx: number,
      currentPicks: AccaLeg[],
      currentOdds: number,
      currentEV: number
    ) => {
      if (evalCount++ > MAX_EVALUATIONS) return;

      if (currentPicks.length === k) {
        // Distance to target odds penalty
        const oddsDiffRatio = Math.abs(currentOdds - targetOdds) / Math.max(1, targetOdds);
        // Score rewards closeness to targetOdds, high EV, and high probability
        const score = 100 / (1 + oddsDiffRatio * 10) + currentEV * 30;
        if (score > bestScore) {
          bestScore = score;
          bestCombination = [...currentPicks];
        }
        return;
      }

      if (fIdx >= simplifiedFixtures.length) return;
      if (simplifiedFixtures.length - fIdx < k - currentPicks.length) return;
      if (currentOdds > targetOdds * 3) return; // Prune runaway multipliers

      // Try picking each leg from this fixture first
      for (const leg of simplifiedFixtures[fIdx]) {
        search(
          fIdx + 1,
          [...currentPicks, leg],
          currentOdds * leg.odds,
          currentEV + leg.expectedValue
        );
      }

      // Try skipping this fixture
      search(fIdx + 1, currentPicks, currentOdds, currentEV);
    };

    search(0, [], 1.0, 0);

    return bestCombination.length > 0 ? bestCombination : this.pickDistinctMatchLegs(candidates, k);
  }

  /**
   * Builds formatted bet slip text for copy-to-clipboard
   */
  private static buildSummaryText(
    slipName: string,
    strategy: string,
    legs: AccaLeg[],
    totalOdds: number,
    winProb: number,
    overallEV: number,
    stake: number,
    payout: number
  ): string {
    const legLines = legs
      .map(
        (l, i) =>
          `${i + 1}. [${l.league}] ${l.homeTeam} vs ${l.awayTeam}\n   Pick: ${l.selection} @ ${l.odds.toFixed(2)} (AI: ${(l.probability * 100).toFixed(1)}%${l.expectedValue > 0 ? ` | +EV ${(l.expectedValue * 100).toFixed(1)}%` : ''})`
      )
      .join('\n\n');

    return `════════════════════════════════════
🎯 FOOTBALL ACCUMULATOR SLIP
════════════════════════════════════
Strategy: ${slipName}
Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}

SELECTIONS (${legs.length} LEGS):
${legLines}

────────────────────────────────────
Total Decimal Odds: ${totalOdds.toFixed(2)}
Model Probability: ${(winProb * 100).toFixed(2)}%
Overall Expected Value: ${overallEV > 0 ? '+' : ''}${(overallEV * 100).toFixed(1)}%
Stake: £${stake.toFixed(2)}
Potential Payout: £${payout.toFixed(2)} (Profit: £${(payout - stake).toFixed(2)})
════════════════════════════════════
Powered by Poisson Statistical AI Engine`;
  }
}
