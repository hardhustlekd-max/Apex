import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { X, History, Target, Trophy, Copy, Check, Ticket } from 'lucide-react';
import { Fixture, HeadToHeadMeasurement, LeagueStandingEntry, LeagueStandingTable, MarketOption, BetSelection } from '../core/types.js';
import { TacticalAnalysis } from './TacticalAnalysis.js';
import { parseDynamicStatistics, StatCategoryGroup } from '../core/statisticsParser.js';
import { EngineService } from '../services/engineService.js';
import { LeagueStandings } from './LeagueStandings.js';
import { getProbValue } from '../core/formatters.js';
import { teamMatchScore, resolveFixtureAlignment, resolveTeamSide } from '../core/feedParser.js';
import { formatMatchDateTime } from '../core/dateUtils.js';
import { Card, SegmentedTabs, StatTile, EmptyState, SectionHeader, TeamAvatar } from './ui/index.js';

export interface MatchDetailViewProps {
  fixture: Fixture | null;
  onClose?: () => void;
  isPanel?: boolean;
  onAddSelection?: (selection: BetSelection) => void;
  selectedSelections?: BetSelection[];
}

type ModalTab = 'OVERVIEW' | 'H2H' | 'STATS' | 'TEAMS' | 'STANDINGS' | 'PREDICTIONS' | 'TACTICS';
type MarketCategoryFilter = 'ALL' | '1X2_DC' | 'GOALS' | 'BTTS' | 'COMBOS' | 'TEAM' | 'SPECIALS';

const WIN_BLOCKED_KEYS = new Set<string>([
  'HOME_WIN',
  'DRAW',
  'AWAY_WIN',
  'DNB_HOME',
  'DNB_AWAY',
  'HOME_WIN_TO_NIL',
  'AWAY_WIN_TO_NIL',
  'HANDICAP_HOME_MINUS_1',
  'HANDICAP_AWAY_MINUS_1',
  'COMBO_1_OVER_15',
  'COMBO_2_OVER_15',
  'COMBO_1_OVER_25',
  'COMBO_2_OVER_25',
  'COMBO_1_OVER_35',
  'COMBO_2_OVER_35',
  'COMBO_1_UNDER_25',
  'COMBO_2_UNDER_25',
  'COMBO_1_UNDER_35',
  'COMBO_2_UNDER_35',
  'COMBO_X_UNDER_25',
  'COMBO_X_OVER_15',
  'COMBO_X_BTTS',
  'COMBO_1_BTTS',
  'COMBO_2_BTTS',
]);

const MARKET_CATEGORY_TABS: Array<{ id: MarketCategoryFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: '1X2_DC', label: '1X2 / DC / DNB' },
  { id: 'GOALS', label: 'Goals O/U' },
  { id: 'BTTS', label: 'BTTS' },
  { id: 'COMBOS', label: 'Combos' },
  { id: 'TEAM', label: 'Team Goals' },
  { id: 'SPECIALS', label: 'Specials' },
];

export const MatchDetailView: React.FC<MatchDetailViewProps> = ({
  fixture,
  onClose,
  isPanel = false,
  onAddSelection,
  selectedSelections = [],
}) => {
  const safeFixture = useMemo(() => {
    if (!fixture) return null;
    return fixture;
  }, [fixture]);

  if (!fixture || !safeFixture) {
    if (isPanel) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center text-theme-sub bg-theme-card select-none">
          <Target className="w-6 h-6 text-theme-primary mb-2" />
          <h4 className="font-semibold text-lg text-theme-main tracking-[-0.015em]">Select a Match</h4>
        </div>
      );
    }
    return null;
  }

  return (
    <MatchDetailModalContent
      fixture={safeFixture}
      onClose={onClose}
      isPanel={isPanel}
      onAddSelection={onAddSelection}
      selectedSelections={selectedSelections}
    />
  );
};

export const MatchDetailModal: React.FC<{
  fixture: Fixture | null;
  onClose: () => void;
  onAddSelection?: (selection: BetSelection) => void;
  selectedSelections?: BetSelection[];
}> = ({
  fixture,
  onClose,
  onAddSelection,
  selectedSelections = [],
}) => {
  const lastFixtureRef = React.useRef(fixture);
  useEffect(() => {
    if (fixture) lastFixtureRef.current = fixture;
  }, [fixture]);

  useEffect(() => {
    if (!fixture) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [fixture, onClose]);

  const displayFixture = fixture || lastFixtureRef.current;
  if (!displayFixture) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${displayFixture.homeTeam} vs ${displayFixture.awayTeam} details`}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-3 bg-theme-overlay backdrop-blur-xl animate-in fade-in duration-200"
    >
      <div
        className="absolute inset-0 cursor-pointer"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-2xl h-[86vh] sm:h-[80vh] max-h-[680px] min-h-0 flex flex-col pointer-events-auto z-10 my-auto shadow-theme-md animate-in slide-in-from-bottom-4 duration-300">
        <MatchDetailView
          fixture={displayFixture}
          onClose={onClose}
          isPanel={false}
          onAddSelection={onAddSelection}
          selectedSelections={selectedSelections}
        />
      </div>
    </div>
  );
};

const MatchDetailModalContent: React.FC<{
  fixture: Fixture;
  onClose?: () => void;
  isPanel?: boolean;
  onAddSelection?: (selection: BetSelection) => void;
  selectedSelections?: BetSelection[];
}> = ({
  fixture,
  onClose,
  isPanel = false,
  onAddSelection,
  selectedSelections = [],
}) => {
  const handleAddBet = (marketKey: string, marketName: string, odds?: number) => {
    if (!odds || odds <= 1.0) return;
    onAddSelection?.({
      fixtureId: fixture.id,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      leagueName: fixture.leagueName,
      marketKey,
      marketName,
      odds,
      matchDate: fixture.matchDate,
      kickOffTime: fixture.kickOffTime,
      timestamp: fixture.timestamp,
      score: fixture.score,
    });
  };

  const isSel = (marketKey: string) =>
    selectedSelections.some((s) => s.fixtureId === fixture.id && s.marketKey === marketKey);
  const [activeTab, setActiveTab] = useState<ModalTab>('OVERVIEW');
  const [statFilterGroup] = useState<StatCategoryGroup>('ALL');
  const [predictionViewFilter, setPredictionViewFilter] = useState<'BEST' | 'COMBOS' | 'ALL'>('BEST');
  const [marketCategoryFilter, setMarketCategoryFilter] = useState<MarketCategoryFilter>('ALL');

  const [enrichedFixture, setEnrichedFixture] = useState<Fixture>(fixture);
  const [, setIsParsing] = useState<boolean>(false);

  const getOddsForMarket = useCallback(
    (marketKey: string, probability: number): { odds: number; isFlashscore: boolean } => {
      const mOdds = enrichedFixture.marketOdds;
      if (mOdds) {
        if (marketKey === 'HOME_WIN' && mOdds.homeOdds && mOdds.homeOdds > 1.0) return { odds: mOdds.homeOdds, isFlashscore: true };
        if (marketKey === 'DRAW' && mOdds.drawOdds && mOdds.drawOdds > 1.0) return { odds: mOdds.drawOdds, isFlashscore: true };
        if (marketKey === 'AWAY_WIN' && mOdds.awayOdds && mOdds.awayOdds > 1.0) return { odds: mOdds.awayOdds, isFlashscore: true };
        if (marketKey === 'DOUBLE_CHANCE_1X' && mOdds.dc1XOdds && mOdds.dc1XOdds > 1.0) return { odds: mOdds.dc1XOdds, isFlashscore: true };
        if (marketKey === 'DOUBLE_CHANCE_12' && mOdds.dc12Odds && mOdds.dc12Odds > 1.0) return { odds: mOdds.dc12Odds, isFlashscore: true };
        if (marketKey === 'DOUBLE_CHANCE_X2' && mOdds.dcX2Odds && mOdds.dcX2Odds > 1.0) return { odds: mOdds.dcX2Odds, isFlashscore: true };
        if (marketKey === 'OVER_15' && mOdds.over15Odds && mOdds.over15Odds > 1.0) return { odds: mOdds.over15Odds, isFlashscore: true };
        if (marketKey === 'UNDER_15' && mOdds.under15Odds && mOdds.under15Odds > 1.0) return { odds: mOdds.under15Odds, isFlashscore: true };
        if (marketKey === 'OVER_25' && mOdds.over25Odds && mOdds.over25Odds > 1.0) return { odds: mOdds.over25Odds, isFlashscore: true };
        if (marketKey === 'UNDER_25' && mOdds.under25Odds && mOdds.under25Odds > 1.0) return { odds: mOdds.under25Odds, isFlashscore: true };
        if (marketKey === 'OVER_35' && mOdds.over35Odds && mOdds.over35Odds > 1.0) return { odds: mOdds.over35Odds, isFlashscore: true };
        if (marketKey === 'UNDER_35' && mOdds.under35Odds && mOdds.under35Odds > 1.0) return { odds: mOdds.under35Odds, isFlashscore: true };
        if (marketKey === 'BTTS_YES' && mOdds.bttsYesOdds && mOdds.bttsYesOdds > 1.0) return { odds: mOdds.bttsYesOdds, isFlashscore: true };
        if (marketKey === 'BTTS_NO' && mOdds.bttsNoOdds && mOdds.bttsNoOdds > 1.0) return { odds: mOdds.bttsNoOdds, isFlashscore: true };
        if (marketKey.startsWith('CORRECT_SCORE_') && Array.isArray(mOdds.topCorrectScores)) {
          const csMatch = /^CORRECT_SCORE_(\d+)_(\d+)$/.exec(marketKey);
          if (csMatch) {
            const targetColon = `${csMatch[1]}:${csMatch[2]}`;
            const targetDash = `${csMatch[1]}-${csMatch[2]}`;
            const found = mOdds.topCorrectScores.find((c) => c.score === targetColon || c.score === targetDash);
            if (found && found.odds > 1.0) return { odds: found.odds, isFlashscore: true };
          }
        }
      }
      const rawFair = probability > 0 ? 1 / probability : 1.5;
      const clampedFair = Math.max(1.02, Math.min(50, rawFair));
      return { odds: Number(clampedFair.toFixed(2)), isFlashscore: false };
    },
    [enrichedFixture.marketOdds]
  );

  const hasTeamFormData = (h?: HeadToHeadMeasurement | null): boolean =>
    !!(
      h &&
      ((h.homeRecentMatches && h.homeRecentMatches.length > 0) ||
        (h.awayRecentMatches && h.awayRecentMatches.length > 0))
    );

  const hasAnyH2HData = (h?: HeadToHeadMeasurement | null): boolean =>
    !!(
      h &&
      (h.matchesCount > 0 ||
        (h.homeRecentMatches && h.homeRecentMatches.length > 0) ||
        (h.awayRecentMatches && h.awayRecentMatches.length > 0) ||
        (h.recentH2H && h.recentH2H.length > 0))
    );

  const initialH2H =
    fixture.measurements?.h2h ||
    fixture.prediction?.measurements?.h2h ||
    null;

  const hasInitialValidH2H = hasTeamFormData(initialH2H);

  const [scrapedH2H, setScrapedH2H] = useState<HeadToHeadMeasurement | null>(hasInitialValidH2H ? initialH2H : null);
  const [isLoadingH2H, setIsLoadingH2H] = useState<boolean>(!hasInitialValidH2H);
  const [standingsTable, setStandingsTable] = useState<LeagueStandingTable | null>(null);
  const [isLoadingStandings, setIsLoadingStandings] = useState<boolean>(true);
  const [copiedKey, setCopiedKey] = useState<'HOME' | 'AWAY' | 'MATCHUP' | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCopiedKey(null);
    setMarketCategoryFilter('ALL');
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, [fixture.id]);

  const handleCopyText = useCallback(async (text: string, key: 'HOME' | 'AWAY' | 'MATCHUP') => {
    const value = text.trim();
    if (!value) return;
    let copied = false;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(value);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied && typeof document !== 'undefined') {
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        copied = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {}
    }

    if (copied) {
      setCopiedKey(key);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1500);
    }
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const currentH2H =
      fixture.measurements?.h2h ||
      fixture.prediction?.measurements?.h2h ||
      null;

    const hasValidH2H = hasTeamFormData(currentH2H);

    setEnrichedFixture(fixture);
    setScrapedH2H(hasValidH2H ? currentH2H : null);
    setIsLoadingH2H(!hasValidH2H);

    async function loadDetailsAndH2H() {
      if (!fixture.id) return;

      let resolvedTeamForm = hasValidH2H;

      if (
        !fixture.statistics?.length ||
        !fixture.information?.length ||
        !fixture.prediction ||
        !fixture.markets?.length ||
        !fixture.prediction?.topCorrectScores?.length ||
        !fixture.marketOdds
      ) {
        setIsParsing(true);
        try {
          const detail = await EngineService.getMatchDetail(fixture.id);
          if (detail && !isCancelled) {
            setEnrichedFixture((prev) => ({
              ...prev,
              ...detail,
              statistics: detail.statistics?.length ? detail.statistics : prev.statistics,
              information: detail.information?.length ? detail.information : prev.information,
              score: detail.score || prev.score,
              marketOdds: detail.marketOdds || prev.marketOdds,
              measurements: {
                ...prev.measurements,
                ...(detail.measurements || {}),
              },
            }));
            const detailH2H = detail.measurements?.h2h || detail.prediction?.measurements?.h2h;
            if (hasAnyH2HData(detailH2H)) {
              setScrapedH2H(detailH2H!);
              if (hasTeamFormData(detailH2H)) {
                resolvedTeamForm = true;
                setIsLoadingH2H(false);
              }
            }
          }
        } catch (err) {
          console.warn('[MatchDetail] Detail fetch failed:', err);
        } finally {
          if (!isCancelled) setIsParsing(false);
        }
      }

      if (!resolvedTeamForm) {
        try {
          setIsLoadingH2H(true);
          const data = await EngineService.getMatchHeadToHead(fixture.id, fixture.homeTeam, fixture.awayTeam);
          if (!isCancelled && hasAnyH2HData(data)) {
            setScrapedH2H(data!);
            setEnrichedFixture((prev) => ({
              ...prev,
              measurements: {
                ...prev.measurements,
                h2h: data!,
              },
              h2hMatches: data!.recentH2H || prev.h2hMatches,
            }));
          }
        } catch (err) {
          console.warn('Unable to load live H2H:', err);
        } finally {
          if (!isCancelled) {
            setIsLoadingH2H(false);
          }
        }
      } else {
        setIsLoadingH2H(false);
      }
    }

    loadDetailsAndH2H();

    return () => {
      isCancelled = true;
    };
  }, [fixture.id, fixture.homeTeam, fixture.awayTeam]);

  useEffect(() => {
    let isCancelled = false;

    async function loadFixtureStandings() {
      const targetLeague = enrichedFixture.league || enrichedFixture.leagueName || 'ALL';
      try {
        setIsLoadingStandings(true);
        const data = await EngineService.getLeagueStandings(targetLeague, {
          leagueUrl: enrichedFixture.leagueUrl,
          leagueName: enrichedFixture.leagueName,
          homeTeam: enrichedFixture.homeTeam,
          awayTeam: enrichedFixture.awayTeam,
        });
        if (!isCancelled) {
          setStandingsTable(data && Array.isArray(data.table) && data.table.length > 0 ? data : null);
        }
      } catch {
        if (!isCancelled) {
          setStandingsTable(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingStandings(false);
        }
      }
    }

    void loadFixtureStandings();

    return () => {
      isCancelled = true;
    };
  }, [
    fixture.id,
    enrichedFixture.league,
    enrichedFixture.leagueUrl,
    enrichedFixture.leagueName,
    enrichedFixture.homeTeam,
    enrichedFixture.awayTeam,
  ]);

  const currentFixture = enrichedFixture;
  const pred = currentFixture.prediction || null;
  const homeStats = currentFixture.homeStats;
  const awayStats = currentFixture.awayStats;

  const { homeStandingInfo, awayStandingInfo } = useMemo(() => {
    const empty = {
      homeStandingInfo: null as { entry: LeagueStandingEntry; totalTeams: number; groupName?: string } | null,
      awayStandingInfo: null as { entry: LeagueStandingEntry; totalTeams: number; groupName?: string } | null,
    };
    if (!standingsTable) return empty;
    const groups =
      Array.isArray(standingsTable.groups) && standingsTable.groups.length > 0
        ? standingsTable.groups
        : Array.isArray(standingsTable.table) && standingsTable.table.length > 0
        ? [{ name: 'Standings', table: standingsTable.table }]
        : [];
    if (groups.length === 0) return empty;

    const findTeam = (teamName: string) => {
      let bestScore = 0;
      let bestRes: { entry: LeagueStandingEntry; totalTeams: number; groupName?: string } | null = null;
      for (const grp of groups) {
        for (const e of grp.table) {
          const s = teamMatchScore(teamName, e.teamName);
          if (s > bestScore) {
            bestScore = s;
            bestRes = {
              entry: e,
              totalTeams: grp.table.length,
              groupName: grp.name && grp.name !== 'Standings' ? grp.name : undefined,
            };
          }
        }
      }
      return bestScore > 0 ? bestRes : null;
    };

    return {
      homeStandingInfo: findTeam(fixture.homeTeam),
      awayStandingInfo: findTeam(fixture.awayTeam),
    };
  }, [standingsTable, fixture.homeTeam, fixture.awayTeam]);

  const { isStandingsClose, standingsCloseReason } = useMemo(() => {
    if (homeStandingInfo && awayStandingInfo) {
      const h = homeStandingInfo.entry;
      const a = awayStandingInfo.entry;
      if (
        h.rank > 0 &&
        a.rank > 0 &&
        h.played >= 1 &&
        a.played >= 1 &&
        (!homeStandingInfo.groupName || !awayStandingInfo.groupName || homeStandingInfo.groupName === awayStandingInfo.groupName)
      ) {
        const rankDiff = Math.abs(h.rank - a.rank);
        const pointsDiff = Math.abs(h.points - a.points);
        const close = rankDiff <= 2;
        if (close) {
          const rankText = rankDiff === 0 ? 'tied rank' : `${rankDiff} ${rankDiff === 1 ? 'place' : 'places'} apart`;
          const ptsText = pointsDiff === 0 ? 'level on pts' : `${pointsDiff} ${pointsDiff === 1 ? 'pt' : 'pts'} apart`;
          return {
            isStandingsClose: true,
            standingsCloseReason: `Standings close (#${h.rank} vs #${a.rank} · ${rankText} · ${ptsText})`,
          };
        }
        return { isStandingsClose: false, standingsCloseReason: undefined };
      }
    }

    const explicitClose =
      currentFixture.standingsClose ??
      pred?.standingsClose ??
      pred?.standingsContext?.standingsClose;
    const explicitReason =
      currentFixture.standingsCloseReason ??
      pred?.standingsCloseReason ??
      pred?.standingsContext?.standingsCloseReason;

    if (typeof explicitClose === 'boolean') {
      return { isStandingsClose: explicitClose, standingsCloseReason: explicitReason };
    }

    return { isStandingsClose: false, standingsCloseReason: undefined };
  }, [
    currentFixture.standingsClose,
    currentFixture.standingsCloseReason,
    pred?.standingsClose,
    pred?.standingsCloseReason,
    pred?.standingsContext?.standingsClose,
    pred?.standingsContext?.standingsCloseReason,
    homeStandingInfo,
    awayStandingInfo,
  ]);

  const allMarketsList = useMemo(() => {
    if (!currentFixture.markets || currentFixture.markets.length === 0) return [];
    return currentFixture.markets
      .filter((market) => !(isStandingsClose && WIN_BLOCKED_KEYS.has(market.key)))
      .map((market) => {
        let groupName = 'Other';
        let category: MarketCategoryFilter = 'SPECIALS';
        if (['HOME_WIN', 'DRAW', 'AWAY_WIN'].includes(market.key)) {
          groupName = '1X2';
          category = '1X2_DC';
        } else if (['DOUBLE_CHANCE_1X', 'DOUBLE_CHANCE_X2', 'DOUBLE_CHANCE_12'].includes(market.key)) {
          groupName = 'Double Chance';
          category = '1X2_DC';
        } else if (['DNB_HOME', 'DNB_AWAY'].includes(market.key)) {
          groupName = 'Draw No Bet';
          category = '1X2_DC';
        } else if (market.key.startsWith('OVER_') || market.key.startsWith('UNDER_')) {
          groupName = 'Goals Over/Under';
          category = 'GOALS';
        } else if (market.key.startsWith('BTTS_')) {
          groupName = 'BTTS';
          category = 'BTTS';
        } else if (market.key.startsWith('COMBO_')) {
          groupName = 'Match Combos';
          category = 'COMBOS';
        } else if (market.key.startsWith('HOME_') || market.key.startsWith('AWAY_')) {
          groupName = 'Team Markets';
          category = 'TEAM';
        } else if (market.key.startsWith('HANDICAP_') || market.key.startsWith('MULTIGOALS_') || market.key.startsWith('GOALS_')) {
          groupName = 'Handicap & Specials';
          category = 'SPECIALS';
        }
        return { groupName, category, ...market };
      });
  }, [currentFixture.markets, isStandingsClose]);

  const bestMarketsPerGroup = useMemo(() => {
    if (!currentFixture.markets) return [];
    const groups: Record<string, MarketOption> = {};
    currentFixture.markets.forEach((market) => {
      if (isStandingsClose && WIN_BLOCKED_KEYS.has(market.key)) return;
      let group = '';
      if (['HOME_WIN', 'DRAW', 'AWAY_WIN'].includes(market.key)) group = '1X2';
      else if (market.key.startsWith('DOUBLE_CHANCE')) group = 'Double Chance';
      else if (market.key.startsWith('DNB')) group = 'Draw No Bet';
      else if (market.key === 'OVER_25' || market.key === 'UNDER_25') group = 'Goals O/U 2.5';
      else if (market.key.startsWith('BTTS')) group = 'BTTS';
      else if (market.key.startsWith('COMBO_')) group = 'Match Combos';
      else if (market.key === 'HOME_OVER_15' || market.key === 'AWAY_OVER_15' || market.key === 'HOME_CLEAN_SHEET' || market.key === 'AWAY_CLEAN_SHEET') group = 'Team Markets';
      else if (market.key === 'MULTIGOALS_1_3' || market.key === 'MULTIGOALS_2_4') group = 'Multi-Goals';
      if (group && (!groups[group] || market.probability > groups[group].probability)) {
        groups[group] = market;
      }
    });
    return Object.entries(groups).map(([groupName, market]) => ({ groupName, ...market }));
  }, [currentFixture.markets, isStandingsClose]);

  const recommendedPick = useMemo(() => {
    const auth = currentFixture.authoritativePick;
    if (auth && !(isStandingsClose && WIN_BLOCKED_KEYS.has(auth.key))) {
      return auth;
    }
    if (bestMarketsPerGroup.length > 0) {
      const sorted = bestMarketsPerGroup.slice().sort((a, b) => b.probability - a.probability);
      const top = sorted[0];
      const pct = getProbValue(top.probability, 1);
      return {
        key: top.key,
        label: top.name,
        probability: top.probability,
        probabilityPercent: pct,
        probabilityFormatted: `${pct.toFixed(1)}%`,
      };
    }
    return null;
  }, [currentFixture.authoritativePick, bestMarketsPerGroup, isStandingsClose]);

  const rawH2H: HeadToHeadMeasurement = useMemo(() => (
    scrapedH2H ||
    enrichedFixture.measurements?.h2h ||
    pred?.measurements?.h2h || {
      matchesCount: enrichedFixture.h2hMatches?.length || 0,
      homeWins: 0,
      draws: 0,
      awayWins: 0,
      homeGoalsAvg: 0,
      awayGoalsAvg: 0,
      h2hMultiplierHome: 1.0,
      h2hMultiplierAway: 1.0,
      recentH2H: enrichedFixture.h2hMatches || [],
      homeClub: fixture.homeTeam,
      awayClub: fixture.awayTeam,
      homeRecentMatches: [],
      awayRecentMatches: [],
    }
  ), [scrapedH2H, enrichedFixture.measurements?.h2h, enrichedFixture.h2hMatches, pred?.measurements?.h2h, fixture.homeTeam, fixture.awayTeam]);

  const isSwappedH2H = useMemo(() => {
    if (!rawH2H.homeClub && !rawH2H.awayClub) return false;
    if (rawH2H.homeClub && rawH2H.awayClub) {
      const alignment = resolveFixtureAlignment(fixture.homeTeam, fixture.awayTeam, rawH2H.homeClub, rawH2H.awayClub);
      if (alignment.matched) return !alignment.isHomeFixture;
    }
    if (rawH2H.homeClub) {
      return resolveTeamSide(rawH2H.homeClub, fixture.homeTeam, fixture.awayTeam) === 'AWAY';
    }
    if (rawH2H.awayClub) {
      return resolveTeamSide(rawH2H.awayClub, fixture.homeTeam, fixture.awayTeam) === 'HOME';
    }
    return false;
  }, [rawH2H.homeClub, rawH2H.awayClub, fixture.homeTeam, fixture.awayTeam]);

  const h2h: HeadToHeadMeasurement = useMemo(() => {
    if (!isSwappedH2H) return rawH2H;
    return {
      ...rawH2H,
      homeClub: rawH2H.awayClub || fixture.homeTeam,
      awayClub: rawH2H.homeClub || fixture.awayTeam,
      homeWins: rawH2H.awayWins,
      awayWins: rawH2H.homeWins,
      homeGoalsAvg: rawH2H.awayGoalsAvg,
      awayGoalsAvg: rawH2H.homeGoalsAvg,
      h2hMultiplierHome: rawH2H.h2hMultiplierAway,
      h2hMultiplierAway: rawH2H.h2hMultiplierHome,
      homeRecentMatches: rawH2H.awayRecentMatches || [],
      awayRecentMatches: rawH2H.homeRecentMatches || [],
    };
  }, [rawH2H, isSwappedH2H, fixture.homeTeam, fixture.awayTeam]);

  const homeRecentMatchesList = useMemo(() => h2h.homeRecentMatches || [], [h2h.homeRecentMatches]);
  const awayRecentMatchesList = useMemo(() => h2h.awayRecentMatches || [], [h2h.awayRecentMatches]);

  const homeRecentFormList = useMemo(() => {
    return homeRecentMatchesList.map((m) => m.result);
  }, [homeRecentMatchesList]);

  const awayRecentFormList = useMemo(() => {
    return awayRecentMatchesList.map((m) => m.result);
  }, [awayRecentMatchesList]);

  const homeGoalsScored = useMemo(() => {
    return homeRecentMatchesList.reduce((acc, m) => acc + m.goalsFor, 0);
  }, [homeRecentMatchesList]);

  const homeGoalsConceded = useMemo(() => {
    return homeRecentMatchesList.reduce((acc, m) => acc + m.goalsAgainst, 0);
  }, [homeRecentMatchesList]);

  const awayGoalsScored = useMemo(() => {
    return awayRecentMatchesList.reduce((acc, m) => acc + m.goalsFor, 0);
  }, [awayRecentMatchesList]);

  const awayGoalsConceded = useMemo(() => {
    return awayRecentMatchesList.reduce((acc, m) => acc + m.goalsAgainst, 0);
  }, [awayRecentMatchesList]);

  const rawStatistics = useMemo(() => {
    return fixture.statistics || [];
  }, [fixture.statistics]);

  const parsedStatsSummary = useMemo(() => {
    return parseDynamicStatistics(rawStatistics);
  }, [rawStatistics]);

  const _filteredStatItems = useMemo(() => {
    if (statFilterGroup === 'ALL') return parsedStatsSummary.items;
    return parsedStatsSummary.items.filter((item) => item.group === statFilterGroup);
  }, [parsedStatsSummary, statFilterGroup]);

  void _filteredStatItems;

  const homeWinPct = pred ? getProbValue(pred.homeWinProb, 1) : 0;
  const awayWinPct = pred ? getProbValue(pred.awayWinProb, 1) : 0;
  const over25Pct = pred ? getProbValue(pred.over25Prob, 1) : 0;
  const bttsPct = pred ? getProbValue(pred.bttsProb, 1) : 0;

  const tabItems = [
    { id: 'OVERVIEW' as ModalTab, label: 'Overview' },
    { id: 'H2H' as ModalTab, label: 'H2H', count: h2h.matchesCount > 0 ? h2h.matchesCount : undefined },
    {
      id: 'TEAMS' as ModalTab,
      label: 'Teams',
      count:
        homeRecentMatchesList.length + awayRecentMatchesList.length > 0
          ? homeRecentMatchesList.length + awayRecentMatchesList.length
          : undefined,
    },
    { id: 'STANDINGS' as ModalTab, label: 'Table' },
    {
      id: 'PREDICTIONS' as ModalTab,
      label: 'Preds',
      count: bestMarketsPerGroup.length > 0 ? bestMarketsPerGroup.length : undefined,
    },
    { id: 'TACTICS' as ModalTab, label: 'Tactics' },
  ];

  const panelContainer = (
    <div
      className={`bg-theme-card text-theme-main flex flex-col overflow-hidden select-none h-full w-full font-sans ${
        isPanel ? '' : 'rounded-t-2xl sm:rounded-2xl border border-theme shadow-theme-md'
      }`}
      style={{ scrollbarGutter: 'stable' }}
    >
      {/* Mobile Drag Handle Affordance */}
      {!isPanel && (
        <div className="w-8 h-1 bg-theme-dim/40 rounded-full mx-auto mt-1.5 mb-0.5 sm:hidden shrink-0 opacity-70" />
      )}

      {/* Neon Gradient Header Band */}
      <div className="bg-theme-header-grad border-b border-theme px-3 pt-1.5 pb-2 shrink-0">
        <div className="min-h-[30px] flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-x-auto no-scrollbar text-xs text-theme-sub">
            <span className="font-medium text-theme-main truncate whitespace-nowrap">
              {fixture.stage || fixture.leagueName}
            </span>
            <span aria-hidden="true" className="text-theme-dim shrink-0">·</span>
            <span className="tabular-nums font-normal text-theme-sub shrink-0">
              {formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp).dateStr}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void handleCopyText(`${fixture.homeTeam} vs ${fixture.awayTeam}`, 'MATCHUP')}
              title={`Copy "${fixture.homeTeam} vs ${fixture.awayTeam}"`}
              aria-label="Copy both team names"
              className="w-[28px] h-[28px] rounded-full hover:bg-theme-subtle text-theme-sub hover:text-theme-main transition-colors cursor-pointer flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            >
              {copiedKey === 'MATCHUP' ? (
                <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[2.25]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-[30px] h-[30px] rounded-full hover:bg-theme-subtle text-theme-sub hover:text-theme-main transition-colors cursor-pointer flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                aria-label="Close match details"
              >
                <X className="w-4 h-4 stroke-[2.25]" />
              </button>
            )}
          </div>
        </div>

        {/* Hero Scoreboard (unboxed directly inside header band) */}
        <div className="mt-1.5 py-1 flex items-center justify-between gap-2.5">
          <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
            <TeamAvatar src={fixture.homeBadge} name={fixture.homeTeam} size="md" />
            <div className="inline-flex items-center justify-center gap-1 max-w-full min-w-0">
              <span className="text-base font-semibold text-theme-main truncate tracking-[-0.01em]">
                {fixture.homeTeam}
              </span>
              <button
                type="button"
                onClick={() => void handleCopyText(fixture.homeTeam, 'HOME')}
                title={`Copy ${fixture.homeTeam}`}
                aria-label={`Copy ${fixture.homeTeam}`}
                className="w-[20px] h-[20px] rounded-md text-theme-dim hover:text-theme-main hover:bg-theme-subtle transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              >
                {copiedKey === 'HOME' ? (
                  <Check className="w-3 h-3 text-emerald-500 stroke-[2.25]" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
            {pred && !isStandingsClose && (
              <span className="text-xs font-semibold tabular-nums text-theme-primary">
                {homeWinPct}%
              </span>
            )}
          </div>

          <div className="flex flex-col items-center shrink-0 px-1.5">
            <span className="text-xl leading-none font-bold tabular-nums text-theme-main tracking-[-0.025em]">
              {fixture.score ? `${fixture.score.home} - ${fixture.score.away}` : 'VS'}
            </span>
            <span className="text-2xs font-medium text-theme-sub uppercase tracking-[0.06em] mt-1 tabular-nums">
              {fixture.status === 'LIVE' ? 'LIVE' : fixture.status === 'FINISHED' ? 'FT' : formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp).timeStr}
            </span>
            {isStandingsClose && (
              <span className="text-2xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5 whitespace-nowrap">
                Close Table · No 1X2
              </span>
            )}
          </div>

          <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
            <TeamAvatar src={fixture.awayBadge} name={fixture.awayTeam} size="md" />
            <div className="inline-flex items-center justify-center gap-1 max-w-full min-w-0">
              <span className="text-base font-semibold text-theme-main truncate tracking-[-0.01em]">
                {fixture.awayTeam}
              </span>
              <button
                type="button"
                onClick={() => void handleCopyText(fixture.awayTeam, 'AWAY')}
                title={`Copy ${fixture.awayTeam}`}
                aria-label={`Copy ${fixture.awayTeam}`}
                className="w-[20px] h-[20px] rounded-md text-theme-dim hover:text-theme-main hover:bg-theme-subtle transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              >
                {copiedKey === 'AWAY' ? (
                  <Check className="w-3 h-3 text-emerald-500 stroke-[2.25]" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
            {pred && !isStandingsClose && (
              <span className="text-xs font-semibold tabular-nums text-sky-500 dark:text-sky-400">
                {awayWinPct}%
              </span>
            )}
          </div>
        </div>

        <div className="mt-1.5">
          <SegmentedTabs<ModalTab>
            items={tabItems}
            value={activeTab}
            onChange={(val) => setActiveTab(val)}
            variant="subtle"
            size="xs"
            fullWidth
            ariaLabel="Match inspection tabs"
          />
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="p-3 overflow-y-auto overscroll-contain space-y-2.5 flex-1 min-h-0 min-w-0">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'OVERVIEW' && (
          <div className="space-y-2.5">
            {pred ? (
              <>
                <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
                  <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
                    <SectionHeader title="Projections" size="sm" className="w-full" />
                  </div>
                  <div className="divide-y divide-[var(--border-subdued)] text-sm tabular-nums">
                    <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                      <span className="text-theme-sub font-normal">Expected Goals (xG)</span>
                      <div className="font-semibold text-theme-main">
                        <span className="text-theme-primary">{pred?.homeXG ?? '-'}</span>
                        <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">vs</span>
                        <span className="text-sky-500 dark:text-sky-400">{pred?.awayXG ?? '-'}</span>
                      </div>
                    </div>

                    {pred?.teamStrength ? (
                      <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                        <span className="text-theme-sub font-normal">Team Strength Index</span>
                        <div className="font-semibold text-theme-main">
                          <span className="text-theme-primary">{pred.teamStrength.homeStrengthRating}</span>
                          <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">vs</span>
                          <span className="text-sky-500 dark:text-sky-400">{pred.teamStrength.awayStrengthRating}</span>
                        </div>
                      </div>
                    ) : pred?.eloRatings ? (
                      <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                        <span className="text-theme-sub font-normal">Elo Ratings</span>
                        <div className="font-semibold text-theme-main">
                          <span className="text-theme-primary">{pred.eloRatings.homeElo}</span>
                          <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">vs</span>
                          <span className="text-sky-500 dark:text-sky-400">{pred.eloRatings.awayElo}</span>
                        </div>
                      </div>
                    ) : null}

                    {pred?.standingsContext && (pred.standingsContext.home || pred.standingsContext.away) && (
                      <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between gap-2">
                        <span className="text-theme-sub font-normal truncate">
                          League Rank{pred.standingsContext.groupName ? ` · ${pred.standingsContext.groupName}` : ''}
                        </span>
                        <div className="font-semibold text-theme-main shrink-0">
                          <span className="text-theme-primary">
                            {pred.standingsContext.home
                              ? `#${pred.standingsContext.home.rank}/${pred.standingsContext.home.totalTeams} (${pred.standingsContext.home.ppg.toFixed(2)})`
                              : '-'}
                          </span>
                          <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">vs</span>
                          <span className="text-sky-500 dark:text-sky-400">
                            {pred.standingsContext.away
                              ? `#${pred.standingsContext.away.rank}/${pred.standingsContext.away.totalTeams} (${pred.standingsContext.away.ppg.toFixed(2)})`
                              : '-'}
                          </span>
                        </div>
                      </div>
                    )}

                    {isStandingsClose && (
                      <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between gap-2 bg-amber-500/10">
                        <span className="text-amber-700 dark:text-amber-300 font-medium text-xs truncate">
                          {standingsCloseReason || 'Close league standings — 1X2 / Win predictions disabled'}
                        </span>
                        <span className="text-xs font-semibold text-theme-main shrink-0">
                          O2.5 {over25Pct}% · BTTS {bttsPct}%
                        </span>
                      </div>
                    )}

                    {pred?.tacticalContext && (
                      <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                        <span className="text-theme-sub font-normal">Rest Days</span>
                        <div className="font-semibold text-theme-main">
                          <span>{pred.tacticalContext.restDaysHome}d</span>
                          <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">vs</span>
                          <span>{pred.tacticalContext.restDaysAway}d</span>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                {enrichedFixture.marketOdds && (
                  <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
                    <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
                      <SectionHeader
                        title="Flashscore Market Odds"
                        size="sm"
                        className="w-full"
                        action={
                          isStandingsClose ? (
                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                              1X2 locked (Close Table)
                            </span>
                          ) : enrichedFixture.marketOdds.bookmakersCount ? (
                            <span className="text-xs font-normal tabular-nums text-theme-dim">
                              {enrichedFixture.marketOdds.bookmakersCount} bookmakers
                            </span>
                          ) : undefined
                        }
                      />
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-[var(--border-subdued)] text-center tabular-nums">
                      <div
                        role={isStandingsClose ? undefined : 'button'}
                        tabIndex={isStandingsClose ? -1 : 0}
                        onClick={() => !isStandingsClose && handleAddBet('HOME_WIN', `Home Win (${fixture.homeTeam})`, enrichedFixture.marketOdds?.homeOdds)}
                        className={`min-h-[58px] py-2 px-2 flex flex-col justify-center transition-colors ${
                          isStandingsClose
                            ? 'opacity-45 cursor-not-allowed'
                            : isSel('HOME_WIN')
                            ? 'bg-theme-primary/15 ring-2 ring-theme-primary cursor-pointer'
                            : 'hover:bg-theme-card-elevated cursor-pointer'
                        }`}
                      >
                        <span className="text-xs font-medium text-theme-sub block">1 (Home)</span>
                        <span className="text-lg font-bold text-theme-primary block mt-0.5 tracking-[-0.015em]">
                          {isStandingsClose ? '—' : enrichedFixture.marketOdds.homeOdds ? enrichedFixture.marketOdds.homeOdds.toFixed(2) : '-'}
                        </span>
                        <span className="text-xs font-normal text-theme-dim block">
                          {isStandingsClose
                            ? 'Blocked'
                            : enrichedFixture.marketOdds.homeImpliedProb !== undefined
                            ? `${(enrichedFixture.marketOdds.homeImpliedProb * 100).toFixed(1)}%`
                            : '-'}
                        </span>
                      </div>
                      <div
                        role={isStandingsClose ? undefined : 'button'}
                        tabIndex={isStandingsClose ? -1 : 0}
                        onClick={() => !isStandingsClose && handleAddBet('DRAW', 'Draw (X)', enrichedFixture.marketOdds?.drawOdds)}
                        className={`min-h-[58px] py-2 px-2 flex flex-col justify-center transition-colors ${
                          isStandingsClose
                            ? 'opacity-45 cursor-not-allowed'
                            : isSel('DRAW')
                            ? 'bg-theme-primary/15 ring-2 ring-theme-primary cursor-pointer'
                            : 'hover:bg-theme-card-elevated cursor-pointer'
                        }`}
                      >
                        <span className="text-xs font-medium text-theme-sub block">X (Draw)</span>
                        <span className="text-lg font-bold text-amber-500 block mt-0.5 tracking-[-0.015em]">
                          {isStandingsClose ? '—' : enrichedFixture.marketOdds.drawOdds ? enrichedFixture.marketOdds.drawOdds.toFixed(2) : '-'}
                        </span>
                        <span className="text-xs font-normal text-theme-dim block">
                          {isStandingsClose
                            ? 'Blocked'
                            : enrichedFixture.marketOdds.drawImpliedProb !== undefined
                            ? `${(enrichedFixture.marketOdds.drawImpliedProb * 100).toFixed(1)}%`
                            : '-'}
                        </span>
                      </div>
                      <div
                        role={isStandingsClose ? undefined : 'button'}
                        tabIndex={isStandingsClose ? -1 : 0}
                        onClick={() => !isStandingsClose && handleAddBet('AWAY_WIN', `Away Win (${fixture.awayTeam})`, enrichedFixture.marketOdds?.awayOdds)}
                        className={`min-h-[58px] py-2 px-2 flex flex-col justify-center transition-colors ${
                          isStandingsClose
                            ? 'opacity-45 cursor-not-allowed'
                            : isSel('AWAY_WIN')
                            ? 'bg-theme-primary/15 ring-2 ring-theme-primary cursor-pointer'
                            : 'hover:bg-theme-card-elevated cursor-pointer'
                        }`}
                      >
                        <span className="text-xs font-medium text-theme-sub block">2 (Away)</span>
                        <span className="text-lg font-bold text-sky-500 dark:text-sky-400 block mt-0.5 tracking-[-0.015em]">
                          {isStandingsClose ? '—' : enrichedFixture.marketOdds.awayOdds ? enrichedFixture.marketOdds.awayOdds.toFixed(2) : '-'}
                        </span>
                        <span className="text-xs font-normal text-theme-dim block">
                          {isStandingsClose
                            ? 'Blocked'
                            : enrichedFixture.marketOdds.awayImpliedProb !== undefined
                            ? `${(enrichedFixture.marketOdds.awayImpliedProb * 100).toFixed(1)}%`
                            : '-'}
                        </span>
                      </div>
                    </div>
                    {(enrichedFixture.marketOdds.dc1XOdds || enrichedFixture.marketOdds.dc12Odds || enrichedFixture.marketOdds.dcX2Odds) && (
                      <div className="border-t border-theme-subdued grid grid-cols-3 divide-x divide-[var(--border-subdued)] text-center text-xs tabular-nums">
                        {([
                          { key: 'DOUBLE_CHANCE_1X', label: '1X', val: enrichedFixture.marketOdds.dc1XOdds, name: `1X (${fixture.homeTeam} or Draw)` },
                          { key: 'DOUBLE_CHANCE_12', label: '12', val: enrichedFixture.marketOdds.dc12Odds, name: '12 (Home or Away)' },
                          { key: 'DOUBLE_CHANCE_X2', label: 'X2', val: enrichedFixture.marketOdds.dcX2Odds, name: `X2 (Draw or ${fixture.awayTeam})` },
                        ]).map((dc) => (
                          <button
                            key={dc.key}
                            type="button"
                            disabled={!dc.val || dc.val <= 1}
                            onClick={() => dc.val && handleAddBet(dc.key, dc.name, dc.val)}
                            className={`min-h-[34px] px-2 py-1.5 flex items-center justify-between gap-1.5 transition-colors ${
                              !dc.val || dc.val <= 1
                                ? 'opacity-40 cursor-not-allowed'
                                : isSel(dc.key)
                                ? 'bg-theme-primary/15 text-theme-primary cursor-pointer'
                                : 'hover:bg-theme-card-elevated cursor-pointer'
                            }`}
                          >
                            <span className="text-theme-sub font-medium">{dc.label}</span>
                            <span className="font-bold text-theme-main">{dc.val ? dc.val.toFixed(2) : '-'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {(enrichedFixture.marketOdds.over15Odds ||
                      enrichedFixture.marketOdds.under15Odds ||
                      enrichedFixture.marketOdds.over25Odds ||
                      enrichedFixture.marketOdds.under25Odds ||
                      enrichedFixture.marketOdds.over35Odds ||
                      enrichedFixture.marketOdds.under35Odds ||
                      enrichedFixture.marketOdds.bttsYesOdds ||
                      enrichedFixture.marketOdds.bttsNoOdds) && (
                      <div className="border-t border-theme-subdued grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-[var(--border-subdued)] text-xs tabular-nums">
                        {([
                          { key: 'OVER_15', label: 'O 1.5', val: enrichedFixture.marketOdds.over15Odds, name: 'Over 1.5 Goals' },
                          { key: 'UNDER_15', label: 'U 1.5', val: enrichedFixture.marketOdds.under15Odds, name: 'Under 1.5 Goals' },
                          { key: 'OVER_25', label: 'O 2.5', val: enrichedFixture.marketOdds.over25Odds, name: 'Over 2.5 Goals' },
                          { key: 'UNDER_25', label: 'U 2.5', val: enrichedFixture.marketOdds.under25Odds, name: 'Under 2.5 Goals' },
                          { key: 'OVER_35', label: 'O 3.5', val: enrichedFixture.marketOdds.over35Odds, name: 'Over 3.5 Goals' },
                          { key: 'UNDER_35', label: 'U 3.5', val: enrichedFixture.marketOdds.under35Odds, name: 'Under 3.5 Goals' },
                          { key: 'BTTS_YES', label: 'BTTS Yes', val: enrichedFixture.marketOdds.bttsYesOdds, name: 'Both Teams to Score (Yes)' },
                          { key: 'BTTS_NO', label: 'BTTS No', val: enrichedFixture.marketOdds.bttsNoOdds, name: 'Both Teams to Score (No)' },
                        ])
                          .filter((item) => item.val && item.val > 1)
                          .map((item) => (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => item.val && handleAddBet(item.key, item.name, item.val)}
                              className={`min-h-[34px] px-2.5 py-1.5 flex items-center justify-between gap-1.5 cursor-pointer transition-colors ${
                                isSel(item.key)
                                  ? 'bg-theme-primary/15 text-theme-primary'
                                  : 'hover:bg-theme-card-elevated'
                              }`}
                            >
                              <span className="text-theme-sub font-medium">{item.label}</span>
                              <span className="font-bold text-theme-main">{item.val!.toFixed(2)}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </Card>
                )}
              </>
            ) : !homeStandingInfo && !awayStandingInfo ? (
              <EmptyState
                icon={<Target className="w-5 h-5" />}
                title="No projections"
                minHeight="min-h-[140px]"
                className="bg-theme-card-elevated"
              />
            ) : null}

            {(homeStandingInfo || awayStandingInfo) && standingsTable && (
              <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
                <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center justify-between gap-2">
                  <SectionHeader
                    title="League Standings"
                    icon={<Trophy className="w-3.5 h-3.5" />}
                    size="sm"
                  />
                  <button
                    type="button"
                    onClick={() => setActiveTab('STANDINGS')}
                    className="text-xs font-semibold text-theme-primary hover:underline cursor-pointer shrink-0 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent rounded"
                  >
                    Full Table
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border-subdued)]">
                  {[
                    {
                      key: 'HOME',
                      teamName: fixture.homeTeam,
                      info: homeStandingInfo,
                      accentClass: 'text-theme-primary',
                      winBgClass: 'bg-theme-primary text-theme-primary-text',
                    },
                    {
                      key: 'AWAY',
                      teamName: fixture.awayTeam,
                      info: awayStandingInfo,
                      accentClass: 'text-sky-500 dark:text-sky-400',
                      winBgClass: 'bg-sky-500 text-white',
                    },
                  ].map((side) => (
                    <div key={side.key} className="p-2.5 space-y-1.5 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-theme-main truncate">{side.teamName}</span>
                        {side.info ? (
                          <span className={`text-sm font-bold tabular-nums shrink-0 ${side.accentClass}`}>
                            #{side.info.entry.rank} / {side.info.totalTeams}
                          </span>
                        ) : (
                          <span className="text-xs text-theme-dim shrink-0">Not ranked</span>
                        )}
                      </div>

                      {side.info && (
                        <>
                          <div className="flex items-center justify-between text-xs text-theme-sub tabular-nums">
                            <span>
                              {side.info.entry.played} MP · {side.info.entry.won}-{side.info.entry.drawn}-{side.info.entry.lost}
                            </span>
                            <span className="font-semibold text-theme-main">
                              {side.info.entry.points} PTS ({side.info.entry.played > 0 ? (side.info.entry.points / side.info.entry.played).toFixed(2) : '0.00'})
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
                            <span className="text-theme-sub">
                              GF {side.info.entry.goalsFor} · GA {side.info.entry.goalsAgainst} · GD{' '}
                              <span className="font-medium text-theme-main">
                                {side.info.entry.goalDifference > 0
                                  ? `+${side.info.entry.goalDifference}`
                                  : side.info.entry.goalDifference}
                              </span>
                            </span>

                            {side.info.entry.form && side.info.entry.form.length > 0 && (
                              <div className="inline-flex items-center gap-0.5 shrink-0">
                                {side.info.entry.form.slice(0, 5).map((r, idx) => (
                                  <span
                                    key={idx}
                                    className={`w-[16px] h-[16px] rounded-[4px] inline-flex items-center justify-center text-2xs leading-none font-bold ${
                                      r === 'W'
                                        ? side.winBgClass
                                        : r === 'D'
                                        ? 'bg-amber-500 text-white'
                                        : 'bg-rose-500 text-white'
                                    }`}
                                  >
                                    {r}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* TAB 2: HEAD TO HEAD */}
        {activeTab === 'H2H' && (
          <div className="space-y-2.5">
            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
                <SectionHeader
                  title="Head to Head"
                  icon={<History className="w-3.5 h-3.5" />}
                  size="sm"
                  className="w-full"
                />
              </div>

              {isLoadingH2H ? (
                <div className="grid grid-cols-3 divide-x divide-[var(--border-subdued)] text-center tabular-nums">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="p-2.5 animate-pulse">
                      <div className="h-3 w-12 mx-auto bg-theme-subtle rounded-md" />
                      <div className="h-5 w-6 mx-auto bg-theme-subtle rounded-md mt-1.5" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 divide-x divide-[var(--border-subdued)]">
                  <StatTile label={`${fixture.homeTeam}`} value={h2h.homeWins} tone="accent" surface="flat" />
                  <StatTile label="Draws" value={h2h.draws} tone="warning" surface="flat" />
                  <StatTile label={`${fixture.awayTeam}`} value={h2h.awayWins} tone="info" surface="flat" />
                </div>
              )}

              {!isLoadingH2H && (
                <div className="border-t border-theme-subdued divide-y divide-[var(--border-subdued)] text-sm tabular-nums">
                  <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                    <span className="text-theme-sub font-normal">Goal Average</span>
                    <span className="font-semibold text-theme-main">
                      {h2h.homeGoalsAvg} vs {h2h.awayGoalsAvg}
                    </span>
                  </div>

                  <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                    <span className="text-theme-sub font-normal">H2H Factor</span>
                    <span className="font-semibold text-theme-primary">
                      x{h2h.h2hMultiplierHome} vs x{h2h.h2hMultiplierAway}
                    </span>
                  </div>
                </div>
              )}
            </Card>

            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
                <SectionHeader title="Past Meetings" size="sm" className="w-full" />
              </div>

              {isLoadingH2H ? (
                <div className="p-3 space-y-1.5">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-8 w-full rounded-lg bg-theme-card animate-pulse" />
                  ))}
                </div>
              ) : h2h.recentH2H && h2h.recentH2H.length > 0 ? (
                <div className="divide-y divide-[var(--border-subdued)] tabular-nums text-sm">
                  {h2h.recentH2H.map((enc, idx) => {
                    const winningTeam =
                      enc.winner === 'HOME' ? enc.homeTeam : enc.winner === 'AWAY' ? enc.awayTeam : null;
                    const winHomeScore = winningTeam ? teamMatchScore(winningTeam, fixture.homeTeam) : 0;
                    const winAwayScore = winningTeam ? teamMatchScore(winningTeam, fixture.awayTeam) : 0;
                    const isHomeWinner = winHomeScore > 0 && winHomeScore >= winAwayScore;
                    const isAwayWinner = winAwayScore > 0 && winAwayScore > winHomeScore;

                    return (
                      <div
                        key={idx}
                        className="min-h-[34px] px-3 py-1.5 flex items-center justify-between gap-2 min-w-0"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="text-xs font-normal text-theme-sub shrink-0">{enc.date}</span>
                          {enc.competition && (
                            <span className="text-xs font-normal text-theme-dim truncate hidden sm:inline">
                              · {enc.competition}
                            </span>
                          )}
                          <span className="font-medium text-theme-main truncate text-sm">
                            {enc.homeTeam} <span className="text-theme-sub font-normal">vs</span> {enc.awayTeam}
                          </span>
                        </div>

                        <div className="shrink-0">
                          <span
                            className={`min-w-[38px] h-[21px] inline-flex items-center justify-center px-2 rounded-md text-xs font-bold leading-none ${
                              isHomeWinner
                                ? 'bg-theme-primary-subtle text-theme-primary'
                                : isAwayWinner
                                ? 'bg-sky-500/15 text-sky-500 dark:text-sky-400'
                                : 'bg-amber-500/15 text-amber-500 dark:text-amber-400'
                            }`}
                          >
                            {enc.score}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-5 text-center text-sm text-theme-sub">No H2H records</div>
              )}
            </Card>
          </div>
        )}

        {/* TAB 3: TEAMS & FORM */}
        {activeTab === 'TEAMS' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {[
              {
                teamName: fixture.homeTeam,
                sideLabel: 'Home Form',
                recentForm: homeRecentFormList,
                recentMatches: homeRecentMatchesList,
                attackStrength: pred?.homeAttackStrength ?? 1.0,
                defenseStrength: pred?.homeDefenseStrength ?? 1.0,
                goalsScored: homeGoalsScored,
                goalsConceded: homeGoalsConceded,
                hasStats: Boolean(homeStats),
                tone: 'accent' as const,
                winBgClass: 'bg-theme-primary text-theme-primary-text',
              },
              {
                teamName: fixture.awayTeam,
                sideLabel: 'Away Form',
                recentForm: awayRecentFormList,
                recentMatches: awayRecentMatchesList,
                attackStrength: pred?.awayAttackStrength ?? 1.0,
                defenseStrength: pred?.awayDefenseStrength ?? 1.0,
                goalsScored: awayGoalsScored,
                goalsConceded: awayGoalsConceded,
                hasStats: Boolean(awayStats),
                tone: 'info' as const,
                winBgClass: 'bg-sky-500 text-white',
              },
            ].map((side) => (
              <Card key={side.sideLabel} surface="elevated" padding="none" radius="2xl" className="overflow-hidden min-w-0">
                <div className="min-h-[34px] px-3 py-1.5 border-b border-theme-subdued flex items-center justify-between gap-2">
                  <span className="font-semibold text-base text-theme-main truncate block tracking-[-0.01em]">{side.teamName}</span>
                  <span className="text-2xs text-theme-sub uppercase tracking-[0.06em] font-medium shrink-0">{side.sideLabel}</span>
                </div>

                {side.recentForm.length > 0 && (
                  <div className="px-3 py-1.5 border-b border-theme-subdued space-y-1 min-w-0">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-theme-sub font-medium">Form Guide</span>
                      <span className="tabular-nums font-normal text-theme-dim">
                        Last {Math.min(10, side.recentForm.length)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 tabular-nums">
                      {side.recentForm.slice(0, 10).map((r, i) => (
                        <span
                          key={i}
                          className={`w-[19px] h-[19px] rounded-md text-2xs leading-none font-bold flex items-center justify-center shrink-0 ${
                            r === 'W'
                              ? side.winBgClass
                              : r === 'D'
                              ? 'bg-amber-500 text-white'
                              : 'bg-rose-500 text-white'
                          }`}
                        >
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 divide-x divide-[var(--border-subdued)] border-b border-theme-subdued">
                  <StatTile label="Attack" value={side.attackStrength} tone={side.tone} surface="flat" />
                  <StatTile label="Defense" value={side.defenseStrength} tone={side.tone} surface="flat" />
                </div>

                {(side.recentMatches.length > 0 || side.hasStats) && (
                  <div className="min-h-[32px] px-3 py-1.5 border-b border-theme-subdued flex items-center justify-between tabular-nums text-sm">
                    <span className="text-theme-sub font-normal">Total Goals</span>
                    <span className="font-semibold text-theme-main">
                      {side.goalsScored} scored · {side.goalsConceded} conceded
                    </span>
                  </div>
                )}

                {side.recentMatches.length > 0 && (
                  <div>
                    <div className="min-h-[32px] px-3 py-1.5 border-b border-theme-subdued flex items-center">
                      <SectionHeader title="Recent Matches" size="sm" className="w-full" />
                    </div>
                    <div className="divide-y divide-[var(--border-subdued)] tabular-nums text-sm">
                      {side.recentMatches.slice(0, 8).map((m, idx) => (
                        <div key={idx} className="min-h-[32px] px-3 py-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span className="text-xs font-normal text-theme-dim shrink-0">{m.date}</span>
                            <span
                              className={`w-[14px] text-center text-2xs font-semibold shrink-0 ${
                                m.isHome ? 'text-theme-main' : 'text-theme-sub'
                              }`}
                            >
                              {m.isHome ? 'H' : 'A'}
                            </span>
                            <span className="font-medium text-theme-main truncate">vs {m.opponent}</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-semibold text-theme-main">
                              {m.goalsFor}-{m.goalsAgainst}
                            </span>
                            <span
                              className={`w-[18px] h-[18px] rounded-md flex items-center justify-center text-2xs leading-none font-bold shrink-0 ${
                                m.result === 'W'
                                  ? side.winBgClass
                                  : m.result === 'D'
                                  ? 'bg-amber-500 text-white'
                                  : 'bg-rose-500 text-white'
                              }`}
                            >
                              {m.result}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* TAB 5: PREDICTIONS */}
        {activeTab === 'PREDICTIONS' && (
          <div className="space-y-2.5">
            {isStandingsClose && (
              <div className="px-3.5 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 flex flex-col gap-0.5">
                <span className="font-semibold">1X2 / Win Prediction Suppressed (Close League Standings)</span>
                <span className="opacity-90">
                  {standingsCloseReason || 'Teams sit close on the standings table.'} Alternative markets (Goals, BTTS, Double Chance) remain predicted below.
                </span>
              </div>
            )}

            {/* Top Model Recommendation Banner with direct Add to Bet Slip */}
            {recommendedPick && (
              <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden border border-theme-primary/30">
                <div className="min-h-[34px] px-3.5 py-1.5 bg-theme-primary-subtle border-b border-theme-subdued flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-theme-primary animate-pulse" />
                    <span className="text-2xs font-bold text-theme-primary uppercase tracking-[0.06em]">
                      {isStandingsClose ? 'Alternative Market Recommendation' : 'Model Recommendation'}
                    </span>
                  </div>
                  <span className="text-xs font-bold text-theme-primary tabular-nums">
                    {recommendedPick.probabilityFormatted}
                  </span>
                </div>
                <div className="p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-bold text-theme-main tracking-[-0.01em] truncate">
                      {recommendedPick.label}
                    </div>
                    <div className="text-xs text-theme-sub truncate mt-0.5">
                      {currentFixture.homeTeam} vs {currentFixture.awayTeam} · {currentFixture.leagueName}
                    </div>
                  </div>
                  {onAddSelection && (() => {
                    const authKey = recommendedPick.key;
                    const { odds: authOdds } = getOddsForMarket(authKey, recommendedPick.probability);
                    const isAuthSelected = isSel(authKey);
                    return (
                      <button
                        type="button"
                        onClick={() =>
                          handleAddBet(
                            authKey,
                            `${recommendedPick.label} (${currentFixture.homeTeam} vs ${currentFixture.awayTeam})`,
                            authOdds
                          )
                        }
                        className={`h-[32px] px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent shrink-0 active:scale-95 ${
                          isAuthSelected
                            ? 'bg-theme-primary text-theme-primary-text shadow-theme-glow'
                            : 'bg-theme-primary text-theme-primary-text hover:opacity-90 shadow-theme-sm'
                        }`}
                        title={isAuthSelected ? 'Remove from Bet Slip' : 'Add to Bet Slip'}
                        aria-label={`${isAuthSelected ? 'Remove' : 'Add'} ${recommendedPick.label} to Bet Slip`}
                      >
                        {isAuthSelected ? (
                          <>
                            <Check className="w-3.5 h-3.5 stroke-[2.2]" />
                            <span>Added to Slip</span>
                          </>
                        ) : (
                          <>
                            <Ticket className="w-3.5 h-3.5" />
                            <span>Add to Slip ({authOdds.toFixed(2)})</span>
                          </>
                        )}
                      </button>
                    );
                  })()}
                </div>
              </Card>
            )}

            {/* Market Predictions List */}
            <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
              <div className="min-h-[38px] px-3.5 py-2 border-b border-theme-subdued flex items-center justify-between gap-2 flex-wrap">
                <SectionHeader title="Market Predictions" size="sm" />
                {allMarketsList.length > 0 && (() => {
                  const comboMarketsCount = allMarketsList.filter((m) => m.category === 'COMBOS').length;
                  return (
                    <div className="flex items-center gap-1 p-0.5 bg-theme-subtle rounded-lg border border-theme-subdued text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setPredictionViewFilter('BEST')}
                        className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                          predictionViewFilter === 'BEST'
                            ? 'bg-theme-primary text-theme-primary-text font-semibold shadow-theme-sm'
                            : 'text-theme-sub hover:text-theme-main'
                        }`}
                      >
                        Best Picks
                      </button>
                      {comboMarketsCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setPredictionViewFilter('COMBOS')}
                          className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                            predictionViewFilter === 'COMBOS'
                              ? 'bg-theme-primary text-theme-primary-text font-semibold shadow-theme-sm'
                              : 'text-theme-sub hover:text-theme-main'
                          }`}
                        >
                          Combos ({comboMarketsCount})
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPredictionViewFilter('ALL')}
                        className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                          predictionViewFilter === 'ALL'
                            ? 'bg-theme-primary text-theme-primary-text font-semibold shadow-theme-sm'
                            : 'text-theme-sub hover:text-theme-main'
                        }`}
                      >
                        All ({allMarketsList.length})
                      </button>
                    </div>
                  );
                })()}
              </div>
              {predictionViewFilter === 'ALL' && allMarketsList.length > 0 && (
                <div className="px-3.5 py-2 border-b border-theme-subdued bg-theme-card/50 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {MARKET_CATEGORY_TABS.map((cat) => {
                    const count =
                      cat.id === 'ALL'
                        ? allMarketsList.length
                        : allMarketsList.filter((m) => m.category === cat.id).length;
                    if (cat.id !== 'ALL' && count === 0) return null;
                    const active = marketCategoryFilter === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setMarketCategoryFilter(cat.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                          active
                            ? 'bg-theme-primary text-theme-primary-text shadow-theme-sm'
                            : 'bg-theme-subtle text-theme-sub hover:text-theme-main'
                        }`}
                      >
                        {cat.label} ({count})
                      </button>
                    );
                  })}
                </div>
              )}
              {(() => {
                const filteredAllMarkets =
                  marketCategoryFilter === 'ALL'
                    ? allMarketsList
                    : allMarketsList.filter((m) => m.category === marketCategoryFilter);

                const comboMarkets = allMarketsList.filter((m) => m.category === 'COMBOS');

                const listToRender =
                  predictionViewFilter === 'COMBOS' && comboMarkets.length > 0
                    ? comboMarkets
                    : predictionViewFilter === 'ALL' && allMarketsList.length > 0
                    ? filteredAllMarkets
                    : bestMarketsPerGroup;

                if (!listToRender || listToRender.length === 0) {
                  return <div className="py-5 text-center text-sm text-theme-sub">No predictions computed</div>;
                }

                return (
                  <div className="divide-y divide-[var(--border-subdued)] tabular-nums text-sm">
                    {listToRender.map((market, idx) => {
                      const { odds: betOdds, isFlashscore } = getOddsForMarket(market.key, market.probability);
                      const isSelected = isSel(market.key);
                      return (
                        <div key={market.key || idx} className="min-h-[50px] px-3.5 py-2.5 flex items-center justify-between gap-2.5 hover:bg-theme-card-elevated transition-colors">
                          <div className="min-w-0 flex-1">
                            <span className="text-2xs text-theme-sub block uppercase font-medium tracking-[0.06em]">
                              {market.groupName} Market
                            </span>
                            <span className="font-semibold text-theme-main text-base tracking-[-0.01em] truncate block mt-0.5">
                              {market.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <span className="font-bold text-theme-primary block text-lg leading-none tracking-[-0.015em]">
                                {(market.probability * 100).toFixed(1)}%
                              </span>
                              <span className="text-xs font-normal text-theme-dim block mt-0.5">
                                {isFlashscore ? `FS ${betOdds.toFixed(2)}` : `Model ${betOdds.toFixed(2)}`}
                              </span>
                            </div>
                            {onAddSelection && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleAddBet(
                                    market.key,
                                    `${market.name} (${currentFixture.homeTeam} vs ${currentFixture.awayTeam})`,
                                    betOdds
                                  )
                                }
                                className={`h-[30px] px-2.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent active:scale-95 shrink-0 ${
                                  isSelected
                                    ? 'bg-theme-primary text-theme-primary-text shadow-theme-sm'
                                    : 'bg-theme-subtle text-theme-main hover:bg-theme-primary/10 hover:text-theme-primary'
                                }`}
                                title={isSelected ? 'Remove from Bet Slip' : 'Add to Bet Slip'}
                                aria-label={`${isSelected ? 'Remove' : 'Add'} ${market.name} to Bet Slip`}
                              >
                                {isSelected ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 stroke-[2.2]" />
                                    <span>Added</span>
                                  </>
                                ) : (
                                  <>
                                    <Ticket className="w-3.5 h-3.5" />
                                    <span>+ Slip</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </Card>

            {/* Correct Score Predictions Grid */}
            {pred?.topCorrectScores && pred.topCorrectScores.length > 0 && (
              <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
                <div className="min-h-[34px] px-3.5 py-1.5 border-b border-theme-subdued flex items-center justify-between gap-2">
                  <SectionHeader title="Correct Score Predictions" size="sm" />
                  <span className="text-2xs text-theme-dim uppercase tracking-[0.06em] font-medium">
                    Tap to add to slip
                  </span>
                </div>
                <div className="p-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2 tabular-nums">
                  {pred.topCorrectScores.slice(0, 6).map((cs) => {
                    const csKey = `CORRECT_SCORE_${cs.homeGoals}_${cs.awayGoals}`;
                    const { odds: csOdds, isFlashscore } = getOddsForMarket(csKey, cs.probability);
                    const isSelected = isSel(csKey);
                    return (
                      <button
                        key={csKey}
                        type="button"
                        onClick={() =>
                          handleAddBet(
                            csKey,
                            `Correct Score ${cs.score} (${currentFixture.homeTeam} vs ${currentFixture.awayTeam})`,
                            csOdds
                          )
                        }
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-theme-primary/15 border-theme-primary shadow-theme-sm'
                            : 'bg-theme-card border-theme-subdued hover:bg-theme-card-elevated hover:border-theme-accent'
                        }`}
                      >
                        <div>
                          <div className="text-base font-bold text-theme-main">{cs.score}</div>
                          <div className="text-2xs text-theme-sub">
                            {(cs.probability * 100).toFixed(1)}%
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-theme-primary block">
                            {csOdds.toFixed(2)}
                          </span>
                          <span className="text-2xs text-theme-dim block">
                            {isFlashscore ? 'FS Odds' : isSelected ? 'In Slip' : '+ Slip'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* TAB 6: STANDINGS */}
        {activeTab === 'STANDINGS' && (
          <div className="space-y-2.5">
            <LeagueStandings
              initialLeague={currentFixture.league || currentFixture.leagueName}
              leagueContext={{
                leagueUrl: currentFixture.leagueUrl,
                leagueName: currentFixture.leagueName,
              }}
              preloadedStandings={standingsTable}
              isLoadingPreloaded={isLoadingStandings}
              highlightTeams={{ homeTeam: currentFixture.homeTeam, awayTeam: currentFixture.awayTeam }}
              compact
            />
          </div>
        )}

        {/* TAB 7: TACTICS */}
        {activeTab === 'TACTICS' && (
          <div className="space-y-2.5">
            <TacticalAnalysis
              fixture={enrichedFixture}
              standingsTable={standingsTable}
              homeStanding={homeStandingInfo}
              awayStanding={awayStandingInfo}
              isLoadingStandings={isLoadingStandings}
            />
          </div>
        )}
      </div>
    </div>
  );

  return panelContainer;
};
