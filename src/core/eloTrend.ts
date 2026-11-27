import { TeamEloTrendPoint, TeamFormMatch } from './types.js';
import { normalizeDateStr } from './dateUtils.js';

function resolveMatchOpponentElo(
  m: TeamFormMatch,
  opponentEloLookup?: (opponentName: string) => number
): number {
  if (typeof m.opponentElo === 'number' && Number.isFinite(m.opponentElo) && m.opponentElo > 0) {
    return Math.round(m.opponentElo);
  }
  if (opponentEloLookup) {
    const resolved = opponentEloLookup(m.opponent);
    if (Number.isFinite(resolved) && resolved > 0) {
      return Math.round(resolved);
    }
  }
  if (typeof m.opponentStrength === 'number' && Number.isFinite(m.opponentStrength)) {
    return Math.round(1500 + (m.opponentStrength - 50) * 8);
  }
  return 1500;
}

/**
 * Reconstructs a chronological 5-match Elo rating trajectory anchored to the team's
 * current Elo rating using the engine's margin- and volatility-adjusted Elo update rule.
 */
export function computeTeamEloTrend(
  currentElo: number,
  recentMatches: TeamFormMatch[] | undefined,
  options?: {
    limit?: number;
    volatilityCoefficient?: number;
    opponentEloLookup?: (opponentName: string) => number;
  }
): TeamEloTrendPoint[] {
  if (!Array.isArray(recentMatches) || recentMatches.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(10, options?.limit ?? 5));
  const vL = Math.max(0.75, Math.min(1.35, options?.volatilityCoefficient ?? 1.0));
  const kEffective = 24 / vL;

  // Sort newest-first, slice the last N matches, then reverse to chronological order (oldest -> newest)
  const newestFirst = [...recentMatches]
    .sort((a, b) => normalizeDateStr(b.date || '').localeCompare(normalizeDateStr(a.date || '')))
    .slice(0, limit);

  const chronological = newestFirst.slice().reverse();
  const points: TeamEloTrendPoint[] = new Array(chronological.length);

  let runningAfter = Number.isFinite(currentElo) && currentElo > 0 ? Math.round(currentElo) : 1500;

  for (let i = chronological.length - 1; i >= 0; i--) {
    const m = chronological[i];
    const oppElo = resolveMatchOpponentElo(m, options?.opponentEloLookup);
    const gd = Math.abs((m.goalsFor ?? 0) - (m.goalsAgainst ?? 0));
    const marginMult = gd >= 3 ? 1.5 : gd === 2 ? 1.25 : 1.0;
    const actual = m.result === 'W' ? 1.0 : m.result === 'D' ? 0.5 : 0.0;
    const homeAdv = m.isHome ? 55 : -55;

    // Fixed-point inversion for eloBefore given eloAfter = eloBefore + K_eff * marginMult * (actual - E(eloBefore))
    let eb = runningAfter;
    for (let iter = 0; iter < 3; iter++) {
      const expected = 1 / (1 + Math.pow(10, (oppElo - (eb + homeAdv)) / 400));
      eb = runningAfter - kEffective * marginMult * (actual - expected);
    }

    const eloBefore = Math.round(eb);
    const eloAfter = Math.round(runningAfter);
    const eloDelta = eloAfter - eloBefore;

    points[i] = {
      matchIndex: i + 1,
      date: normalizeDateStr(m.date || ''),
      opponent: m.opponent,
      isHome: Boolean(m.isHome),
      goalsFor: m.goalsFor ?? 0,
      goalsAgainst: m.goalsAgainst ?? 0,
      result: m.result,
      eloBefore,
      eloAfter,
      eloDelta,
      opponentElo: oppElo,
      ...(m.opponentRank !== undefined ? { opponentRank: m.opponentRank } : {}),
    };

    runningAfter = eloBefore;
  }

  return points;
}
