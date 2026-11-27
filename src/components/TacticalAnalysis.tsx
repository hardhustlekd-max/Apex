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

    let styleName = 'Mid-Table Balance';
    const tagline = '';
    let buildUpStyle = 'Mixed Progression';
    let defensiveShape = '4-2-3-1 Mid Block';

    if (rankPct <= 0.25 && attackRatio >= 1.18 && defenseRatio <= 0.95) {
      styleName = 'High-Press Control';
      buildUpStyle = 'Vertical Overloads';
      defensiveShape = '4-3-3 High Press';
    } else if (attackRatio >= 1.12 && defenseRatio >= 1.06) {
      styleName = 'Vertical Transition';
      buildUpStyle = 'Rapid Vertical';
      defensiveShape = '4-2-3-1 Transition';
    } else if (defenseRatio <= 0.85 && attackRatio < 1.12) {
      styleName = 'Defensive Control';
      buildUpStyle = 'Measured Counters';
      defensiveShape = '4-4-2 / 5-3-2 Block';
    } else if (rankPct >= 0.72 || zoneTier === 'RELEGATION' || (attackRatio < 0.86 && defenseRatio > 1.08)) {
      styleName = 'Low-Block Counter';
      buildUpStyle = 'Direct Long';
      defensiveShape = '5-4-1 Low Block';
    }

    const attackDiffPct = Math.round((attackRatio - 1) * 100);
    const defenseDiffPct = Math.round((1 - defenseRatio) * 100);

    const keyStrength =
      attackRatio >= 1.1 && attackRatio - 1 >= 1 - defenseRatio
        ? `${snap.gfPerGame.toFixed(2)} GF/M (${attackDiffPct >= 0 ? `+${attackDiffPct}%` : `${attackDiffPct}%`}) · ${snap.ppg.toFixed(2)} PPG`
        : defenseRatio <= 0.9
        ? `${snap.gaPerGame.toFixed(2)} GA/M (${defenseDiffPct}% tighter)`
        : snap.ppg >= 1.5
        ? `${snap.points} pts / ${snap.played} MP · ${snap.gdPerGame >= 0 ? '+' : ''}${snap.gdPerGame.toFixed(2)} GD/M`
        : `${snap.won}W-${snap.drawn}D-${snap.lost}L (${snap.played} MP)`;

    const vulnerability =
      defenseRatio >= 1.1
        ? `${snap.gaPerGame.toFixed(2)} GA/M vs ${safeAvg.toFixed(2)} avg`
        : attackRatio <= 0.88
        ? `${snap.gfPerGame.toFixed(2)} GF/M scoring`
        : formRate !== null && formRate < 0.35
        ? `Recent form: ${formRecord}`
        : `${snap.gdPerGame >= 0 ? '+' : ''}${snap.gdPerGame.toFixed(2)} GD/M`;

    const summary = '';

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
      ? 'Compact Block'
      : 'Balanced Posture';

  return {
    styleName,
    tagline: '',
    intensityLabel: `Index ${intensityScore}/100`,
    buildUpStyle: highAttack ? 'Progressive Short' : 'Transition Support',
    defensiveShape: tightDefense ? 'Compact Low-Mid' : '4-2-3-1 Shape',
    keyStrength: `${attackPower.toFixed(2)} att · ${effectiveXG.toFixed(2)} xG`,
    vulnerability: `${defensePower.toFixed(2)} def index`,
    summary: '',
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
      const expectedTempo = (homeSnap.gfPerGame + awaySnap.gaPerGame + awaySnap.gfPerGame + homeSnap.gaPerGame) / 2;
      const tempoTag =
        expectedTempo >= tableAvg * 2 * 1.14
          ? 'High-Tempo'
          : expectedTempo <= tableAvg * 2 * 0.88
          ? 'Low-Margin'
          : 'Balanced';

      return { tempoTag, headline: '' };
    }

    if (homeSnap || awaySnap) {
      return {
        tempoTag: 'Partial Table',
        headline: '',
      };
    }

    return {
      tempoTag: pred ? `${(pred.homeXG + pred.awayXG).toFixed(2)} xG` : 'Match Metrics',
      headline: '',
    };
  }, [homeSnap, awaySnap, tableAvg, pred]);

  const battlegrounds = useMemo<BattlegroundInsight[]>(() => {
    if (homeSnap && awaySnap) {
      const ppgDiff = homeSnap.ppg - awaySnap.ppg;
      const leaderTeam = ppgDiff >= 0 ? fixture.homeTeam : fixture.awayTeam;
      const rankGap = Math.abs(homeSnap.rank - awaySnap.rank);
      const homeFormRate = computeFormPointsRate(homeRecentForm);
      const awayFormRate = computeFormPointsRate(awayRecentForm);

      const rankMomentumDetail =
        rankGap === 0
          ? `${homeSnap.ppg.toFixed(2)} vs ${awaySnap.ppg.toFixed(2)} PPG`
          : `${leaderTeam} +${rankGap} pos · +${Math.abs(ppgDiff).toFixed(2)} PPG${
              homeFormRate !== null && awayFormRate !== null
                ? ` (${Math.round(homeFormRate * 100)}% vs ${Math.round(awayFormRate * 100)}%)`
                : ''
            }`;

      const homeAttVsAwayDef = homeSnap.gfPerGame / Math.max(0.4, tableAvg) + awaySnap.gaPerGame / Math.max(0.4, tableAvg);
      const awayAttVsHomeDef = awaySnap.gfPerGame / Math.max(0.4, tableAvg) + homeSnap.gaPerGame / Math.max(0.4, tableAvg);
      const primaryAttackTitle =
        homeAttVsAwayDef >= awayAttVsHomeDef
          ? `${fixture.homeTeam} Attack`
          : `${fixture.awayTeam} Attack`;
      const attackDefenseDetail =
        homeAttVsAwayDef >= awayAttVsHomeDef
          ? `${homeSnap.gfPerGame.toFixed(2)} GF/M vs ${awaySnap.gaPerGame.toFixed(2)} GA/M`
          : `${awaySnap.gfPerGame.toFixed(2)} GF/M vs ${homeSnap.gaPerGame.toFixed(2)} GA/M`;

      const homeZone = classifyZoneTier(homeSnap);
      const awayZone = classifyZoneTier(awaySnap);
      const stakesTitle =
        homeZone !== 'MIDTABLE' && awayZone !== 'MIDTABLE'
          ? 'Dual Zone Stakes'
          : homeZone !== 'MIDTABLE'
          ? `${fixture.homeTeam} Stakes`
          : awayZone !== 'MIDTABLE'
          ? `${fixture.awayTeam} Stakes`
          : 'Goal Margin';
      const stakesDetail =
        homeSnap.zoneLabel || awaySnap.zoneLabel
          ? `${homeSnap.zoneLabel ? `${fixture.homeTeam}: ${homeSnap.zoneLabel}` : ''}${homeSnap.zoneLabel && awaySnap.zoneLabel ? ' · ' : ''}${awaySnap.zoneLabel ? `${fixture.awayTeam}: ${awaySnap.zoneLabel}` : ''}`
          : `${homeSnap.gdPerGame >= 0 ? '+' : ''}${homeSnap.gdPerGame.toFixed(2)} vs ${awaySnap.gdPerGame >= 0 ? '+' : ''}${awaySnap.gdPerGame.toFixed(2)} GD/M`;

      return [
        {
          kicker: 'Hierarchy',
          title: `#${homeSnap.rank} vs #${awaySnap.rank}`,
          detail: rankMomentumDetail,
        },
        {
          kicker: 'Att vs Def',
          title: primaryAttackTitle,
          detail: attackDefenseDetail,
        },
        {
          kicker: 'Stakes',
          title: stakesTitle,
          detail: stakesDetail,
        },
      ];
    }

    return [
      {
        kicker: 'Att vs Def',
        title: 'Index Split',
        detail: `${(pred?.homeAttackStrength ?? 1).toFixed(2)} att vs ${(pred?.awayDefenseStrength ?? 1).toFixed(2)} def`,
      },
      {
        kicker: 'Projected xG',
        title: `${pred?.homeXG?.toFixed(2) ?? '—'} vs ${pred?.awayXG?.toFixed(2) ?? '—'}`,
        detail: `Total ${((pred?.homeXG ?? 1.2) + (pred?.awayXG ?? 1.1)).toFixed(2)} xG`,
      },
      {
        kicker: 'Rest',
        title: 'Turnaround',
        detail:
          pred?.tacticalContext?.restDifferential !== undefined && pred.tacticalContext.restDifferential !== 0
            ? `${pred.tacticalContext.restDifferential > 0 ? '+' : ''}${pred.tacticalContext.restDifferential}d rest diff`
            : 'Equal rest',
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
        <div className="min-h-[34px] px-3 pt-2.5 pb-1.5 flex items-center justify-between gap-2">
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
            <div className="px-2.5 pb-2.5 grid grid-cols-1 md:grid-cols-2 gap-2">
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
                  accentClass: 'text-theme-info',
                  winBgClass: 'bg-[var(--status-info)] text-white',
                },
              ].map((side) => (
                <div key={side.key} className="p-2.5 rounded-xl bg-theme-card space-y-2 min-w-0">
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

                      <div className="grid grid-cols-4 gap-1.5 text-center tabular-nums">
                        <div className="rounded-lg bg-theme-subtle/60 py-1.5 px-1">
                          <span className="text-2xs text-theme-sub block uppercase tracking-[0.06em]">GF/M</span>
                          <span className="text-xs font-semibold text-theme-main">{side.snap.gfPerGame.toFixed(2)}</span>
                        </div>
                        <div className="rounded-lg bg-theme-subtle/60 py-1.5 px-1">
                          <span className="text-2xs text-theme-sub block uppercase tracking-[0.06em]">GA/M</span>
                          <span className="text-xs font-semibold text-theme-main">{side.snap.gaPerGame.toFixed(2)}</span>
                        </div>
                        <div className="rounded-lg bg-theme-subtle/60 py-1.5 px-1">
                          <span className="text-2xs text-theme-sub block uppercase tracking-[0.06em]">GD/M</span>
                          <span className="text-xs font-semibold text-theme-main">
                            {side.snap.gdPerGame > 0 ? `+${side.snap.gdPerGame.toFixed(2)}` : side.snap.gdPerGame.toFixed(2)}
                          </span>
                        </div>
                        <div className="rounded-lg bg-theme-subtle/60 py-1.5 px-1">
                          <span className="text-2xs text-theme-sub block uppercase tracking-[0.06em]">
                            {side.xgDelta !== undefined ? 'xG Shift' : 'Att/Def'}
                          </span>
                          {side.xgDelta !== undefined ? (
                            <span
                              className={`text-xs font-semibold ${
                                side.xgDelta > 0
                                  ? 'text-theme-success'
                                  : side.xgDelta < 0
                                  ? 'text-theme-danger'
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
                                    : 'bg-theme-live text-white'
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
              <div className="px-3 pb-2.5 space-y-1">
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
            No table available.
          </div>
        )}
      </Card>

      {/* Matchup Style Summary */}
      <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[34px] px-3 pt-2.5 pb-1 flex items-center justify-between gap-2">
          <SectionHeader
            title="Matchup Profile"
            icon={<Compass className="w-3.5 h-3.5" />}
            size="sm"
          />
          <span className="text-xs font-medium text-theme-sub tabular-nums">
            {matchupSummary.tempoTag}
          </span>
        </div>

        <div className="px-3 pb-3 pt-1 flex items-center justify-between gap-2 text-sm tabular-nums flex-wrap">
          <div className="min-w-0">
            <span className="text-2xs text-theme-sub uppercase block">{fixture.homeTeam}</span>
            <span className="font-semibold text-theme-main">{homeProfile.styleName}</span>
          </div>
          <span className="text-xs text-theme-dim font-medium">vs</span>
          <div className="min-w-0 text-right">
            <span className="text-2xs text-theme-sub uppercase block">{fixture.awayTeam}</span>
            <span className="font-semibold text-theme-main">{awayProfile.styleName}</span>
          </div>
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
            <div className="min-h-[34px] px-3 pt-2.5 pb-1 flex items-center justify-between gap-2">
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

            <div className="px-3 pb-3 pt-1 space-y-2">
              <span className="text-base font-semibold text-theme-main block tracking-[-0.01em]">
                {side.profile.styleName}
              </span>

              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-xl bg-theme-card p-2.5">
                  <span className="text-2xs text-theme-sub block uppercase font-medium tracking-[0.06em]">Build-up</span>
                  <span className="text-sm font-semibold text-theme-main mt-0.5 block">{side.profile.buildUpStyle}</span>
                </div>
                <div className="rounded-xl bg-theme-card p-2.5">
                  <span className="text-2xs text-theme-sub block uppercase font-medium tracking-[0.06em]">Shape</span>
                  <span className="text-sm font-semibold text-theme-main mt-0.5 block">{side.profile.defensiveShape}</span>
                </div>
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2 text-theme-success">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-theme-sub font-normal tabular-nums">
                    <strong className="text-theme-main font-semibold">Strength:</strong> {side.profile.keyStrength}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-theme-danger">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-theme-sub font-normal tabular-nums">
                    <strong className="text-theme-main font-semibold">Risk:</strong> {side.profile.vulnerability}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Key Matchup Battlegrounds */}
      <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
        <div className="min-h-[34px] px-3 pt-2.5 pb-1 flex items-center">
          <SectionHeader title="Key Metrics" size="sm" className="w-full" />
        </div>
        <div className="px-2.5 pb-2.5 grid grid-cols-1 sm:grid-cols-3 gap-1.5">
          {battlegrounds.map((bg) => (
            <div key={bg.kicker} className="p-2.5 rounded-xl bg-theme-card space-y-1 tabular-nums">
              <span className="text-2xs text-theme-sub uppercase font-medium block tracking-[0.06em]">{bg.kicker}</span>
              <span className="font-semibold text-base text-theme-main block tracking-[-0.01em]">{bg.title}</span>
              <span className="text-xs font-normal text-theme-sub block">{bg.detail}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};
