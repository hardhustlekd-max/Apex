import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Fixture,
  LeagueStandingEntry,
  LeagueStandingTable,
  StandingsPredictionContext,
  TeamStandingsSnapshot,
} from '../core/types.js';
import { Card, SectionHeader, TeamAvatar } from './ui/index.js';
import { Compass, ShieldAlert, CheckCircle2, Trophy } from 'lucide-react';

export interface TacticalStandingInfo {
  entry: LeagueStandingEntry;
  totalTeams: number;
  groupName?: string;
}

export interface TacticalAnalysisProps {
  fixture: Fixture;
  standingsTable?: LeagueStandingTable | null;
  homeStanding?: TacticalStandingInfo | null;
  awayStanding?: TacticalStandingInfo | null;
  isLoadingStandings?: boolean;
}

interface TeamTacticalProfile {
  styleName: string;
  tagline: string;
  intensityLabel: string;
  buildUpStyle: string;
  defensiveShape: string;
  keyStrength: string;
  vulnerability: string;
  summary: string;
  formRecord?: string;
}

interface BattlegroundInsight {
  kicker: string;
  title: string;
  detail: string;
}

function buildSnapshotFromEntry(info: TacticalStandingInfo): TeamStandingsSnapshot | undefined {
  const { entry, totalTeams, groupName } = info;
  if (!entry || entry.played <= 0) return undefined;
  const played = Math.max(1, entry.played);
  const resolvedTotal = Math.max(entry.rank || 1, totalTeams || 1);
  return {
    rank: entry.rank,
    totalTeams: resolvedTotal,
    played,
    won: entry.won,
    drawn: entry.drawn,
    lost: entry.lost,
    goalsFor: entry.goalsFor,
    goalsAgainst: entry.goalsAgainst,
    goalDifference: entry.goalDifference,
    points: entry.points,
    ppg: Number((entry.points / played).toFixed(2)),
    gfPerGame: Number((entry.goalsFor / played).toFixed(2)),
    gaPerGame: Number((entry.goalsAgainst / played).toFixed(2)),
    gdPerGame: Number((entry.goalDifference / played).toFixed(2)),
    form: entry.form && entry.form.length > 0 ? entry.form.slice(0, 5) : undefined,
    zoneCode: entry.zoneCode,
    zoneLabel: entry.zoneLabel,
    groupName: groupName && groupName !== 'Standings' ? groupName : undefined,
    reliabilityWeight: Number((played / (played + 6)).toFixed(3)),
  };
}

function computeTableAvgGoalsPerGame(
  standingsTable?: LeagueStandingTable | null,
  preferredGroupName?: string
): number {
  if (!standingsTable) return 1.35;
  let rows: LeagueStandingEntry[] = standingsTable.table || [];
  if (Array.isArray(standingsTable.groups) && standingsTable.groups.length > 0) {
    const matched = preferredGroupName
      ? standingsTable.groups.find((g) => g.name === preferredGroupName)
      : standingsTable.groups[0];
    if (matched && matched.table.length > 0) {
      rows = matched.table;
    }
  }
  let totalGF = 0;
  let totalPlayed = 0;
  for (const r of rows) {
    if (r.played > 0 && Number.isFinite(r.goalsFor)) {
      totalGF += r.goalsFor;
      totalPlayed += r.played;
    }
  }
  if (totalPlayed <= 0 || totalGF <= 0) return 1.35;
  return Number(Math.max(0.65, Math.min(2.5, totalGF / totalPlayed)).toFixed(2));
}

function classifyZoneTier(snap?: TeamStandingsSnapshot): 'TITLE' | 'PLAYOFF' | 'RELEGATION' | 'MIDTABLE' {
  if (!snap) return 'MIDTABLE';
  const z = (snap.zoneCode || '').toLowerCase();
  const lbl = (snap.zoneLabel || '').toLowerCase();
  if (z.startsWith('r') || lbl.includes('relegat')) return 'RELEGATION';
  if (
    z.startsWith('q') ||
    lbl.includes('champion') ||
    lbl.includes('promot') ||
    lbl.includes('title') ||
    lbl.includes('europa') ||
    lbl.includes('conference')
  ) {
    return 'TITLE';
  }
  if (z.startsWith('p') || lbl.includes('playoff') || lbl.includes('play-off')) return 'PLAYOFF';
  if (snap.totalTeams >= 10) {
    if (snap.rank <= Math.max(2, Math.round(snap.totalTeams * 0.2))) return 'TITLE';
    if (snap.rank >= snap.totalTeams - Math.max(2, Math.round(snap.totalTeams * 0.15)) + 1) return 'RELEGATION';
  }
  return 'MIDTABLE';
}

function computeFormPointsRate(form?: ('W' | 'D' | 'L')[]): number | null {
  if (!form || form.length === 0) return null;
  let pts = 0;
  for (const r of form) {
    if (r === 'W') pts += 3;
    else if (r === 'D') pts += 1;
  }
  return pts / (form.length * 3);
}

function formatRecentFormRecord(form?: ('W' | 'D' | 'L')[]): string | undefined {
  if (!form || form.length === 0) return undefined;
  let w = 0;
  let d = 0;
  let l = 0;
  for (const r of form) {
    if (r === 'W') w++;
    else if (r === 'D') d++;
    else l++;
  }
  return `${w}W-${d}D-${l}L`;
}

function deriveTeamTacticalProfile(params: {
  teamName: string;
  isHome: boolean;
  snap?: TeamStandingsSnapshot;
  tableAvg: number;
  attackPower: number;
  defensePower: number;
  teamXG?: number;
  recentForm?: ('W' | 'D' | 'L')[];
}): TeamTacticalProfile {
  const { teamName, isHome, snap, tableAvg, attackPower, defensePower, teamXG, recentForm } = params;

  if (snap) {
    const safeAvg = Math.max(0.65, tableAvg);
    const attackRatio = snap.gfPerGame / safeAvg;
    const defenseRatio = snap.gaPerGame / safeAvg;
    const rankPct = snap.totalTeams > 1 ? (snap.rank - 1) / (snap.totalTeams - 1) : 0.5;
    const formRate = computeFormPointsRate(snap.form || recentForm);
    const formBoost = formRate !== null ? (formRate - 0.5) * 14 : 0;
    const intensityScore = Math.round(
      Math.max(48, Math.min(96, 62 + (attackRatio - 1) * 24 + (1 - rankPct) * 16 + formBoost + (isHome ? 3 : 0)))
    );
    const formRecord = formatRecentFormRecord(snap.form || recentForm);
    const zoneTier = classifyZoneTier(snap);

    let styleName = 'Pragmatic Mid-Table Balance';
    let tagline = 'Adaptive mid-block structure calibrated to opponent strength.';
    let buildUpStyle = 'Mixed Progression & Half-Space Support';
    let defensiveShape = 'Compact 4-2-3-1 Mid Block';

    if (rankPct <= 0.25 && attackRatio >= 1.18 && defenseRatio <= 0.95) {
      styleName = 'High-Press Territorial Control';
      tagline = 'Dominant possession share, high defensive line, and sustained box pressure.';
      buildUpStyle = 'Patient Vertical Overloads & Third-Man Runs';
      defensiveShape = 'Aggressive 4-3-3 High Press';
    } else if (attackRatio >= 1.12 && defenseRatio >= 1.06) {
      styleName = 'Open Vertical Transition';
      tagline = 'High-tempo attacking commitment that trades defensive security for shot volume.';
      buildUpStyle = 'Rapid Vertical Thrusts & Early Wide Switches';
      defensiveShape = 'High-Risk 4-2-3-1 Transition Block';
    } else if (defenseRatio <= 0.85 && attackRatio < 1.12) {
      styleName = 'Structured Defensive Control';
      tagline = 'Low-conceding compact block prioritizing central protection and set-piece control.';
      buildUpStyle = 'Measured Counter-Attacks & Wide Outlets';
      defensiveShape = 'Disciplined 4-4-2 / 5-3-2 Low-Mid Block';
    } else if (rankPct >= 0.72 || zoneTier === 'RELEGATION' || (attackRatio < 0.86 && defenseRatio > 1.08)) {
      styleName = 'Survival Low-Block & Direct Counter';
      tagline = 'Deep box protection under pressure with direct vertical balls on turnovers.';
      buildUpStyle = 'Direct Long Distribution & Second-Ball Runs';
      defensiveShape = 'Deep 5-4-1 Survival Block';
    }

    const attackDiffPct = Math.round((attackRatio - 1) * 100);
    const defenseDiffPct = Math.round((1 - defenseRatio) * 100);

    const keyStrength =
      attackRatio >= 1.1 && attackRatio - 1 >= 1 - defenseRatio
        ? `Scoring ${snap.gfPerGame.toFixed(2)} GF/M (${attackDiffPct >= 0 ? `+${attackDiffPct}%` : `${attackDiffPct}%`} vs table avg) at ${snap.ppg.toFixed(2)} PPG.`
        : defenseRatio <= 0.9
        ? `Restricting opponents to ${snap.gaPerGame.toFixed(2)} GA/M (${defenseDiffPct}% tighter than table avg).`
        : snap.ppg >= 1.5
        ? `Consistent table output (${snap.points} pts in ${snap.played} MP, ${snap.gdPerGame >= 0 ? '+' : ''}${snap.gdPerGame.toFixed(2)} GD/M).`
        : `Balanced home/away point accumulation (${snap.won}W-${snap.drawn}D-${snap.lost}L across ${snap.played} MP).`;

    const vulnerability =
      defenseRatio >= 1.1
        ? `Conceding ${snap.gaPerGame.toFixed(2)} GA/M vs ${safeAvg.toFixed(2)} league avg exposes transition lanes.`
        : attackRatio <= 0.88
        ? `Limited scoring output (${snap.gfPerGame.toFixed(2)} GF/M) demands clean sheets to take points.`
        : formRate !== null && formRate < 0.35
        ? `Recent table slide (${formRecord}) reduces margin for defensive errors.`
        : `Mid-tier goal margins (${snap.gdPerGame >= 0 ? '+' : ''}${snap.gdPerGame.toFixed(2)} GD/M) invite tight scorelines.`;

    const zonePhrase = snap.zoneLabel
      ? ` Currently in ${snap.zoneLabel} contention.`
      : zoneTier === 'TITLE'
      ? ' Competing in the upper qualification tier.'
      : zoneTier === 'RELEGATION'
      ? ' Facing high-urgency relegation pressure.'
      : '';

    const summary = `${teamName} sits #${snap.rank} of ${snap.totalTeams} (${snap.points} pts, ${snap.ppg.toFixed(2)} PPG) with ${snap.goalsFor}:${snap.goalsAgainst} goals across ${snap.played} matches.${zonePhrase}`;

    return {
      styleName,
      tagline,
      intensityLabel: `Press ${intensityScore}/100`,
      buildUpStyle,
      defensiveShape,
      keyStrength,
      vulnerability,
      summary,
      formRecord,
    };
  }

  // Fallback only to actual model xG / strength / form metrics (never name hashing)
  const effectiveXG = teamXG ?? 1.25;
  const highAttack = attackPower >= 1.12 || effectiveXG >= 1.6;
  const tightDefense = defensePower <= 0.9;
  const intensityScore = Math.round(Math.max(50, Math.min(92, 66 + (attackPower - 1) * 28 + (1 - defensePower) * 18)));
  const formRecord = formatRecentFormRecord(recentForm);

  const styleName =
    highAttack && tightDefense
      ? 'Front-Foot Control'
      : highAttack
      ? 'Attacking Verticality'
      : tightDefense
      ? 'Compact Defensive Block'
      : 'Balanced Matchup Posture';

  return {
    styleName,
    tagline: 'Derived from model attack/defense indices and recent match xG.',
    intensityLabel: `Index ${intensityScore}/100`,
    buildUpStyle: highAttack ? 'Progressive Short & Half-Space Passing' : 'Structured Transition Support',
    defensiveShape: tightDefense ? 'Compact Mid-Low Defensive Block' : 'Adaptive 4-2-3-1 Shape',
    keyStrength: `Attack index ${attackPower.toFixed(2)} with projected ${effectiveXG.toFixed(2)} xG.`,
    vulnerability: `Defense conceding index at ${defensePower.toFixed(2)} relative to match baseline.`,
    summary: `${teamName} enters unranked in the stored table; tactical outlook reflects model attack (${attackPower.toFixed(2)}) and defense (${defensePower.toFixed(2)}) ratings.`,
    formRecord,
  };
}

export const TacticalAnalysis: React.FC<TacticalAnalysisProps> = ({
  fixture,
  standingsTable,
  homeStanding,
  awayStanding,
  isLoadingStandings = false,
}) => {
  const pred = fixture.prediction;
  const engineStandings = pred?.standingsContext;

  const resolvedStandings = useMemo<{
    context: StandingsPredictionContext | null;
    homeSnap?: TeamStandingsSnapshot;
    awaySnap?: TeamStandingsSnapshot;
    tableAvg: number;
    hasTableData: boolean;
  }>(() => {
    const liveHomeSnap = homeStanding ? buildSnapshotFromEntry(homeStanding) : undefined;
    const liveAwaySnap = awayStanding ? buildSnapshotFromEntry(awayStanding) : undefined;

    const homeSnap = liveHomeSnap
      ? { ...engineStandings?.home, ...liveHomeSnap }
      : engineStandings?.home;
    const awaySnap = liveAwaySnap
      ? { ...engineStandings?.away, ...liveAwaySnap }
      : engineStandings?.away;

    const matchedGroup =
      homeSnap?.groupName && awaySnap?.groupName && homeSnap.groupName === awaySnap.groupName
        ? homeSnap.groupName
        : homeSnap?.groupName || awaySnap?.groupName || engineStandings?.groupName;

    const tableAvg =
      engineStandings?.tableAvgGoalsPerGame && engineStandings.tableAvgGoalsPerGame > 0 && !standingsTable
        ? engineStandings.tableAvgGoalsPerGame
        : standingsTable
        ? computeTableAvgGoalsPerGame(standingsTable, matchedGroup)
        : engineStandings?.tableAvgGoalsPerGame || 1.35;

    const hasTableData = Boolean(homeSnap || awaySnap);

    if (!hasTableData) {
      return {
        context: engineStandings || null,
        homeSnap: undefined,
        awaySnap: undefined,
        tableAvg,
        hasTableData: false,
      };
    }

    const safeAvg = Math.max(0.65, tableAvg);
    const attackAnchorHome =
      engineStandings?.attackAnchorHome && engineStandings.home
        ? engineStandings.attackAnchorHome
        : homeSnap
        ? Number(Math.max(0.55, Math.min(1.85, homeSnap.gfPerGame / safeAvg)).toFixed(2))
        : 1.0;
    const defenseAnchorHome =
      engineStandings?.defenseAnchorHome && engineStandings.home
        ? engineStandings.defenseAnchorHome
        : homeSnap
        ? Number(Math.max(0.55, Math.min(1.85, homeSnap.gaPerGame / safeAvg)).toFixed(2))
        : 1.0;
    const attackAnchorAway =
      engineStandings?.attackAnchorAway && engineStandings.away
        ? engineStandings.attackAnchorAway
        : awaySnap
        ? Number(Math.max(0.55, Math.min(1.85, awaySnap.gfPerGame / safeAvg)).toFixed(2))
        : 1.0;
    const defenseAnchorAway =
      engineStandings?.defenseAnchorAway && engineStandings.away
        ? engineStandings.defenseAnchorAway
        : awaySnap
        ? Number(Math.max(0.55, Math.min(1.85, awaySnap.gaPerGame / safeAvg)).toFixed(2))
        : 1.0;

    const context: StandingsPredictionContext = {
      leagueCode: standingsTable?.leagueCode || engineStandings?.leagueCode || fixture.league,
      leagueName: standingsTable?.leagueName || engineStandings?.leagueName || fixture.leagueName,
      season: standingsTable?.season || engineStandings?.season,
      groupName: matchedGroup,
      home: homeSnap,
      away: awaySnap,
      tableAvgGoalsPerGame: Number(tableAvg.toFixed(2)),
      attackAnchorHome,
      defenseAnchorHome,
      attackAnchorAway,
      defenseAnchorAway,
      motivationMultiplierHome: engineStandings?.motivationMultiplierHome ?? 1.0,
      motivationMultiplierAway: engineStandings?.motivationMultiplierAway ?? 1.0,
      xgDeltaPercentHome: engineStandings?.xgDeltaPercentHome,
      xgDeltaPercentAway: engineStandings?.xgDeltaPercentAway,
    };

    return {
      context,
      homeSnap,
      awaySnap,
      tableAvg: context.tableAvgGoalsPerGame,
      hasTableData: true,
    };
  }, [engineStandings, standingsTable, homeStanding, awayStanding, fixture.league, fixture.leagueName]);

  const { context: standingsCtx, homeSnap, awaySnap, tableAvg, hasTableData } = resolvedStandings;

  const homeRecentForm =
    homeSnap?.form ||
    fixture.measurements?.h2h?.homeRecentMatches?.map((m) => m.result) ||
    fixture.homeStats?.recentForm;
  const awayRecentForm =
    awaySnap?.form ||
    fixture.measurements?.h2h?.awayRecentMatches?.map((m) => m.result) ||
    fixture.awayStats?.recentForm;

  const homeProfile = useMemo<TeamTacticalProfile>(
    () =>
      deriveTeamTacticalProfile({
        teamName: fixture.homeTeam || 'Home Team',
        isHome: true,
        snap: homeSnap,
        tableAvg,
        attackPower: pred?.homeAttackStrength ?? 1.0,
        defensePower: pred?.homeDefenseStrength ?? 1.0,
        teamXG: pred?.homeXG,
        recentForm: homeRecentForm,
      }),
    [fixture.homeTeam, homeSnap, tableAvg, pred?.homeAttackStrength, pred?.homeDefenseStrength, pred?.homeXG, homeRecentForm]
  );

  const awayProfile = useMemo<TeamTacticalProfile>(
    () =>
      deriveTeamTacticalProfile({
        teamName: fixture.awayTeam || 'Away Team',
        isHome: false,
        snap: awaySnap,
        tableAvg,
        attackPower: pred?.awayAttackStrength ?? 1.0,
        defensePower: pred?.awayDefenseStrength ?? 1.0,
        teamXG: pred?.awayXG,
        recentForm: awayRecentForm,
      }),
    [fixture.awayTeam, awaySnap, tableAvg, pred?.awayAttackStrength, pred?.awayDefenseStrength, pred?.awayXG, awayRecentForm]
  );

  const tacticalNotes = useMemo(() => {
    const notes: string[] = [...(pred?.tacticalContext?.tacticalNotes || [])];
    const seen = new Set(notes);
    const pushUnique = (msg: string) => {
      if (!seen.has(msg)) {
        seen.add(msg);
        notes.push(msg);
      }
    };

    if (homeSnap && awaySnap) {
      const rankDiff = awaySnap.rank - homeSnap.rank;
      const ppgDiff = homeSnap.ppg - awaySnap.ppg;
      if (Math.abs(rankDiff) >= Math.max(5, Math.round(homeSnap.totalTeams * 0.3))) {
        const favored = rankDiff > 0 ? fixture.homeTeam : fixture.awayTeam;
        const gap = Math.abs(rankDiff);
        pushUnique(
          `Significant table gap: ${favored} holds a ${gap}-place & ${Math.abs(ppgDiff).toFixed(2)} PPG advantage`
        );
      }
      const expectedMatchGoals = (homeSnap.gfPerGame + awaySnap.gaPerGame + awaySnap.gfPerGame + homeSnap.gaPerGame) / 2;
      if (expectedMatchGoals >= tableAvg * 2 * 1.18) {
        pushUnique(
          `High-scoring table profile: combined rate ${expectedMatchGoals.toFixed(2)} G/M vs ${(tableAvg * 2).toFixed(2)} league avg`
        );
      } else if (expectedMatchGoals <= tableAvg * 2 * 0.84) {
        pushUnique(
          `Low-margin table profile: combined rate ${expectedMatchGoals.toFixed(2)} G/M points to tight goal margins`
        );
      }
    }
    return notes;
  }, [pred?.tacticalContext?.tacticalNotes, homeSnap, awaySnap, tableAvg, fixture.homeTeam, fixture.awayTeam]);

  const matchupSummary = useMemo(() => {
    if (homeSnap && awaySnap) {
      const rankDiff = awaySnap.rank - homeSnap.rank;
      const ppgDiff = homeSnap.ppg - awaySnap.ppg;
      const expectedTempo = (homeSnap.gfPerGame + awaySnap.gaPerGame + awaySnap.gfPerGame + homeSnap.gaPerGame) / 2;
      const tempoTag =
        expectedTempo >= tableAvg * 2 * 1.14
          ? 'Open High-Tempo'
          : expectedTempo <= tableAvg * 2 * 0.88
          ? 'Compact Low-Margin'
          : 'Balanced Tempo';

      let headline = `${fixture.homeTeam} (#${homeSnap.rank}, ${homeSnap.ppg.toFixed(2)} PPG) hosts ${fixture.awayTeam} (#${awaySnap.rank}, ${awaySnap.ppg.toFixed(2)} PPG). `;

      if (ppgDiff >= 0.45) {
        headline += `${fixture.homeTeam} enters with clear table superiority (+${ppgDiff.toFixed(2)} PPG and ${Math.abs(rankDiff)} places higher), favoring home territorial dominance against ${awayProfile.defensiveShape.toLowerCase()}.`;
      } else if (ppgDiff <= -0.45) {
        headline += `${fixture.awayTeam} carries superior table momentum (+${Math.abs(ppgDiff).toFixed(2)} PPG and ${Math.abs(rankDiff)} places higher), forcing ${fixture.homeTeam} to stay disciplined in defensive transitions.`;
      } else {
        headline += `Separated by just ${Math.abs(ppgDiff).toFixed(2)} PPG in the standings, both sides match up evenly — expect fine margins around ${homeSnap.gfPerGame.toFixed(2)} vs ${awaySnap.gfPerGame.toFixed(2)} GF/M scoring rates.`;
      }

      return { tempoTag, headline };
    }

    if (homeSnap || awaySnap) {
      const rankedSide = homeSnap
        ? `${fixture.homeTeam} (#${homeSnap.rank}/${homeSnap.totalTeams}, ${homeSnap.ppg.toFixed(2)} PPG)`
        : `${fixture.awayTeam} (#${awaySnap!.rank}/${awaySnap!.totalTeams}, ${awaySnap!.ppg.toFixed(2)} PPG)`;
      return {
        tempoTag: 'Partial Table Data',
        headline: `${rankedSide} brings verified league-table benchmarks into a matchup projected at ${pred?.homeXG?.toFixed(2) ?? '1.25'} vs ${pred?.awayXG?.toFixed(2) ?? '1.10'} xG.`,
      };
    }

    return {
      tempoTag: pred ? `${(pred.homeXG + pred.awayXG).toFixed(2)} Projected xG` : 'Match Metrics',
      headline: `${fixture.homeTeam} (${homeProfile.styleName}) meets ${fixture.awayTeam} (${awayProfile.styleName}) with model projections at ${pred?.homeXG?.toFixed(2) ?? '—'} vs ${pred?.awayXG?.toFixed(2) ?? '—'} xG.`,
    };
  }, [homeSnap, awaySnap, tableAvg, fixture.homeTeam, fixture.awayTeam, awayProfile.defensiveShape, homeProfile.styleName, pred]);

  const battlegrounds = useMemo<BattlegroundInsight[]>(() => {
    if (homeSnap && awaySnap) {
      const ppgDiff = homeSnap.ppg - awaySnap.ppg;
      const leaderTeam = ppgDiff >= 0 ? fixture.homeTeam : fixture.awayTeam;
      const rankGap = Math.abs(homeSnap.rank - awaySnap.rank);
      const homeFormRate = computeFormPointsRate(homeRecentForm);
      const awayFormRate = computeFormPointsRate(awayRecentForm);

      const rankMomentumDetail =
        rankGap === 0
          ? `Level on rank with ${homeSnap.ppg.toFixed(2)} vs ${awaySnap.ppg.toFixed(2)} PPG.`
          : `${leaderTeam} leads by ${rankGap} places and +${Math.abs(ppgDiff).toFixed(2)} PPG${
              homeFormRate !== null && awayFormRate !== null
                ? ` (${Math.round(homeFormRate * 100)}% vs ${Math.round(awayFormRate * 100)}% recent form).`
                : '.'
            }`;

      const homeAttVsAwayDef = homeSnap.gfPerGame / Math.max(0.4, tableAvg) + awaySnap.gaPerGame / Math.max(0.4, tableAvg);
      const awayAttVsHomeDef = awaySnap.gfPerGame / Math.max(0.4, tableAvg) + homeSnap.gaPerGame / Math.max(0.4, tableAvg);
      const primaryAttackTitle =
        homeAttVsAwayDef >= awayAttVsHomeDef
          ? `${fixture.homeTeam} Attack Edge`
          : `${fixture.awayTeam} Counter Edge`;
      const attackDefenseDetail =
        homeAttVsAwayDef >= awayAttVsHomeDef
          ? `${fixture.homeTeam} averages ${homeSnap.gfPerGame.toFixed(2)} GF/M against ${fixture.awayTeam}'s ${awaySnap.gaPerGame.toFixed(2)} GA/M defense.`
          : `${fixture.awayTeam} posts ${awaySnap.gfPerGame.toFixed(2)} GF/M into ${fixture.homeTeam}'s ${homeSnap.gaPerGame.toFixed(2)} GA/M backline.`;

      const homeZone = classifyZoneTier(homeSnap);
      const awayZone = classifyZoneTier(awaySnap);
      const stakesTitle =
        homeZone !== 'MIDTABLE' && awayZone !== 'MIDTABLE'
          ? 'Dual Zone Pressure'
          : homeZone !== 'MIDTABLE'
          ? `${fixture.homeTeam} Stakes`
          : awayZone !== 'MIDTABLE'
          ? `${fixture.awayTeam} Stakes`
          : 'Goal Margin Discipline';
      const stakesDetail =
        homeSnap.zoneLabel || awaySnap.zoneLabel
          ? `${homeSnap.zoneLabel ? `${fixture.homeTeam}: ${homeSnap.zoneLabel}. ` : ''}${awaySnap.zoneLabel ? `${fixture.awayTeam}: ${awaySnap.zoneLabel}.` : ''}`
          : `GD/M stands at ${homeSnap.gdPerGame >= 0 ? '+' : ''}${homeSnap.gdPerGame.toFixed(2)} vs ${awaySnap.gdPerGame >= 0 ? '+' : ''}${awaySnap.gdPerGame.toFixed(2)} across ${homeSnap.played} and ${awaySnap.played} matches.`;

      return [
        {
          kicker: 'Table Hierarchy',
          title: `#${homeSnap.rank} vs #${awaySnap.rank} (${Math.abs(ppgDiff).toFixed(2)} PPG Gap)`,
          detail: rankMomentumDetail,
        },
        {
          kicker: 'Attack vs Defense',
          title: primaryAttackTitle,
          detail: attackDefenseDetail,
        },
        {
          kicker: 'Standings Stakes',
          title: stakesTitle,
          detail: stakesDetail,
        },
      ];
    }

    return [
      {
        kicker: 'Attack vs Defense',
        title: 'xG Efficiency Split',
        detail: `${fixture.homeTeam} (${(pred?.homeAttackStrength ?? 1).toFixed(2)} att) faces ${fixture.awayTeam} (${(pred?.awayDefenseStrength ?? 1).toFixed(2)} def).`,
      },
      {
        kicker: 'Projected Output',
        title: `${pred?.homeXG?.toFixed(2) ?? '—'} vs ${pred?.awayXG?.toFixed(2) ?? '—'} xG`,
        detail: `Model expects ${((pred?.homeXG ?? 1.2) + (pred?.awayXG ?? 1.1)).toFixed(2)} total goals based on match and form metrics.`,
      },
      {
        kicker: 'Rest & Context',
        title: 'Turnaround Impact',
        detail:
          pred?.tacticalContext?.restDifferential !== undefined && pred.tacticalContext.restDifferential !== 0
            ? `Rest differential of ${pred.tacticalContext.restDifferential > 0 ? '+' : ''}${pred.tacticalContext.restDifferential} days factors into late-game intensity.`
            : 'Both squads enter on comparable preparation cadence.',
      },
    ];
  }, [homeSnap, awaySnap, homeRecentForm, awayRecentForm, fixture.homeTeam, fixture.awayTeam, tableAvg, pred]);

  const formatDelta = (delta?: number) => {
    if (delta === undefined || !Number.isFinite(delta)) return '—';
    return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%`;
  };

  return (
    <div className="space-y-2.5 font-sans">
      <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[34px] px-3 py-1.5 bg-theme-header-grad border-b border-theme-subdued flex items-center justify-between gap-2">
          <SectionHeader
            title="League Standings Influence"
            icon={<Trophy className="w-3.5 h-3.5" />}
            size="sm"
          />
          <span className="text-xs font-normal text-theme-sub tabular-nums truncate">
            {hasTableData && standingsCtx
              ? `${standingsCtx.groupName ? `${standingsCtx.groupName} · ` : ''}Avg ${standingsCtx.tableAvgGoalsPerGame.toFixed(2)} G/M`
              : isLoadingStandings
              ? 'Loading table…'
              : 'No table synced'}
          </span>
        </div>

        {hasTableData && standingsCtx ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subdued)]">
              {[
                {
                  key: 'HOME',
                  teamName: fixture.homeTeam,
                  snap: standingsCtx.home,
                  attackAnchor: standingsCtx.attackAnchorHome,
                  defenseAnchor: standingsCtx.defenseAnchorHome,
                  motivation: standingsCtx.motivationMultiplierHome,
                  xgDelta: standingsCtx.xgDeltaPercentHome,
                  accentClass: 'text-theme-primary',
                  winBgClass: 'bg-theme-primary text-theme-primary-text',
                },
                {
                  key: 'AWAY',
                  teamName: fixture.awayTeam,
                  snap: standingsCtx.away,
                  attackAnchor: standingsCtx.attackAnchorAway,
                  defenseAnchor: standingsCtx.defenseAnchorAway,
                  motivation: standingsCtx.motivationMultiplierAway,
                  xgDelta: standingsCtx.xgDeltaPercentAway,
                  accentClass: 'text-sky-700 dark:text-sky-400',
                  winBgClass: 'bg-sky-600 text-white',
                },
              ].map((side) => (
                <div key={side.key} className="p-3 space-y-2 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-theme-main truncate">{side.teamName}</span>
                    {side.snap ? (
                      <span className={`text-sm font-bold tabular-nums shrink-0 ${side.accentClass}`}>
                        #{side.snap.rank} / {side.snap.totalTeams}
                      </span>
                    ) : (
                      <span className="text-xs text-theme-dim shrink-0">Unranked</span>
                    )}
                  </div>

                  {side.snap && (
                    <>
                      <div className="flex items-center justify-between text-xs text-theme-sub tabular-nums">
                        <span>
                          {side.snap.played} MP · {side.snap.won}-{side.snap.drawn}-{side.snap.lost} · {side.snap.points} PTS
                        </span>
                        <span className="font-semibold text-theme-main">
                          {side.snap.ppg.toFixed(2)} PPG
                        </span>
                      </div>

                      <div className="grid grid-cols-4 divide-x divide-[var(--border-subdued)] border-y border-theme-subdued py-1.5 text-center tabular-nums">
                        <div>
                          <span className="text-2xs text-theme-sub block uppercase tracking-[0.06em]">GF/M</span>
                          <span className="text-xs font-semibold text-theme-main">{side.snap.gfPerGame.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-2xs text-theme-sub block uppercase tracking-[0.06em]">GA/M</span>
                          <span className="text-xs font-semibold text-theme-main">{side.snap.gaPerGame.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-2xs text-theme-sub block uppercase tracking-[0.06em]">GD/M</span>
                          <span className="text-xs font-semibold text-theme-main">
                            {side.snap.gdPerGame > 0 ? `+${side.snap.gdPerGame.toFixed(2)}` : side.snap.gdPerGame.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="text-2xs text-theme-sub block uppercase tracking-[0.06em]">
                            {side.xgDelta !== undefined ? 'xG Shift' : 'Att/Def'}
                          </span>
                          {side.xgDelta !== undefined ? (
                            <span
                              className={`text-xs font-semibold ${
                                side.xgDelta > 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : side.xgDelta < 0
                                  ? 'text-rose-700 dark:text-rose-400'
                                  : 'text-theme-main'
                              }`}
                            >
                              {formatDelta(side.xgDelta)}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-theme-main">
                              {side.attackAnchor.toFixed(2)}/{side.defenseAnchor.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      {side.snap.form && side.snap.form.length > 0 && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-2xs text-theme-sub uppercase tracking-[0.06em]">Table Form</span>
                          <div className="flex items-center gap-1 tabular-nums">
                            {side.snap.form.slice(0, 5).map((r, idx) => (
                              <span
                                key={idx}
                                className={`w-[17px] h-[17px] rounded-full text-2xs leading-none font-bold flex items-center justify-center ${
                                  r === 'W'
                                    ? side.winBgClass
                                    : r === 'D'
                                    ? 'bg-amber-400 text-slate-950'
                                    : 'bg-rose-600 text-white'
                                }`}
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {(side.snap.zoneLabel || side.motivation !== 1) && (
                        <div className="flex items-center justify-between gap-2 text-xs text-theme-sub tabular-nums">
                          <span className="truncate">{side.snap.zoneLabel || 'Zone stakes active'}</span>
                          <span className="font-semibold text-theme-main shrink-0">
                            Stakes x{side.motivation.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {tacticalNotes.length > 0 && (
              <div className="px-3 py-2 border-t border-theme-subdued space-y-1">
                {tacticalNotes.map((note, idx) => (
                  <div key={idx} className="text-xs text-theme-sub leading-snug">
                    · {note}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : isLoadingStandings ? (
          <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="h-20 rounded-xl bg-theme-subtle animate-pulse" />
            <div className="h-20 rounded-xl bg-theme-subtle animate-pulse" />
          </div>
        ) : (
          <div className="px-3 py-2.5 text-xs text-theme-sub">
            League standings are unavailable for this competition; tactical analysis below uses match form and projected xG metrics.
          </div>
        )}
      </Card>

      {/* Standings-Driven Tactical Matchup Overview */}
      <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[34px] px-3 py-1.5 bg-theme-header-grad border-b border-theme-subdued flex items-center justify-between gap-2">
          <SectionHeader
            title="Tactical Matchup Analysis"
            icon={<Compass className="w-3.5 h-3.5" />}
            size="sm"
          />
          <span className="text-xs font-medium text-theme-sub hidden sm:inline tabular-nums">
            {matchupSummary.tempoTag}
          </span>
        </div>

        <div className="p-3.5">
          <p className="text-sm font-normal text-theme-main leading-relaxed">
            {matchupSummary.headline}{' '}
            <motion.span whileHover={{ scale: 1.02, color: 'var(--color-primary)' }} className="font-medium underline decoration-dotted">
              {fixture.homeTeam}
            </motion.span>{' '}
            projects into <span className="font-semibold">{homeProfile.styleName}</span> against{' '}
            <motion.span whileHover={{ scale: 1.02, color: 'var(--color-primary)' }} className="font-medium underline decoration-dotted">
              {fixture.awayTeam}
            </motion.span>
            &apos;s <span className="font-semibold">{awayProfile.styleName}</span>.
          </p>
        </div>
      </Card>

      {/* Side-by-Side Team Tactical Profiles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
        {[
          {
            key: 'HOME',
            identityLabel: homeSnap ? `Home · #${homeSnap.rank}` : 'Home',
            teamName: fixture.homeTeam,
            badge: fixture.homeBadge,
            profile: homeProfile,
          },
          {
            key: 'AWAY',
            identityLabel: awaySnap ? `Away · #${awaySnap.rank}` : 'Away',
            teamName: fixture.awayTeam,
            badge: fixture.awayBadge,
            profile: awayProfile,
          },
        ].map((side) => (
          <Card key={side.key} surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
            <div className="min-h-[34px] px-3 py-1.5 bg-theme-header-grad border-b border-theme-subdued flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <TeamAvatar src={side.badge} name={side.teamName} size="sm" />
                <div className="min-w-0">
                  <span className="text-base font-semibold text-theme-main truncate block tracking-[-0.01em]">
                    {side.teamName}
                  </span>
                  <span className="text-2xs text-theme-sub uppercase font-medium tracking-[0.06em] tabular-nums">
                    {side.identityLabel}
                    {side.profile.formRecord ? ` · ${side.profile.formRecord}` : ''}
                  </span>
                </div>
              </div>
              <span className="text-xs font-semibold text-theme-primary shrink-0 tabular-nums">
                {side.profile.intensityLabel}
              </span>
            </div>

            <div className="p-3.5 space-y-2.5">
              <div>
                <span className="text-base font-semibold text-theme-main block tracking-[-0.01em]">
                  {side.profile.styleName}
                </span>
                <span className="text-sm font-normal text-theme-sub block leading-snug mt-0.5">{side.profile.tagline}</span>
              </div>

              <div className="grid grid-cols-2 divide-x divide-[var(--border-subdued)] border-y border-theme-subdued py-2">
                <div className="pr-2.5">
                  <span className="text-2xs text-theme-sub block uppercase font-medium tracking-[0.06em]">Build-up</span>
                  <span className="text-sm font-semibold text-theme-main mt-0.5 block">{side.profile.buildUpStyle}</span>
                </div>
                <div className="pl-2.5">
                  <span className="text-2xs text-theme-sub block uppercase font-medium tracking-[0.06em]">Shape</span>
                  <span className="text-sm font-semibold text-theme-main mt-0.5 block">{side.profile.defensiveShape}</span>
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="text-theme-sub font-normal tabular-nums">
                    <strong className="text-theme-main font-semibold">Strength:</strong> {side.profile.keyStrength}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-rose-700 dark:text-rose-400">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="text-theme-sub font-normal tabular-nums">
                    <strong className="text-theme-main font-semibold">Vulnerability:</strong> {side.profile.vulnerability}
                  </span>
                </div>
              </div>

              <p className="text-sm font-normal text-theme-sub leading-relaxed pt-1 border-t border-theme-subdued tabular-nums">
                {side.profile.summary}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* Key Matchup Battlegrounds */}
      <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
          <SectionHeader title="Critical Matchup Battlegrounds" size="sm" className="w-full" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subdued)]">
          {battlegrounds.map((bg) => (
            <div key={bg.kicker} className="p-3 space-y-1 tabular-nums">
              <span className="text-2xs text-theme-sub uppercase font-medium block tracking-[0.06em]">{bg.kicker}</span>
              <span className="font-semibold text-base text-theme-main block tracking-[-0.01em]">{bg.title}</span>
              <p className="text-sm font-normal text-theme-sub leading-relaxed">{bg.detail}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
