import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, History, Target, Trophy, Copy, Check, ChevronDown } from 'lucide-react';
import { Fixture, HeadToHeadMeasurement, LeagueStandingEntry, LeagueStandingTable, MarketOption, BetSelection } from '../core/types.js';
import { TacticalAnalysis } from './TacticalAnalysis.js';
import { parseDynamicStatistics, StatCategoryGroup } from '../core/statisticsParser.js';
import { EngineService } from '../services/engineService.js';
import { LeagueStandings } from './LeagueStandings.js';
import { getProbValue } from '../core/formatters.js';
import { teamMatchScore, resolveFixtureAlignment, resolveTeamSide } from '../core/feedParser.js';
import { formatMatchDateTime } from '../core/dateUtils.js';
import { Card, SegmentedTabs, SegmentedTabItem, StatTile, EmptyState, SectionHeader, TeamAvatar } from './ui/index.js';

export interface MatchDetailViewProps {
  fixture: Fixture | null;
  onClose?: () => void;
  isPanel?: boolean;
  onAddSelection?: (selection: BetSelection) => void;
  selectedSelections?: BetSelection[];
}

type DetailTab = 'OVERVIEW' | 'H2H' | 'STATS' | 'TEAMS' | 'STANDINGS' | 'PREDICTIONS' | 'TACTICS';
type MarketCategoryFilter =
  | 'ALL'
  | 'MAIN'
  | 'TOTALS'
  | 'COMBOS'
  | 'TEAM'
  | 'SPECIALS';
type ComboSubFilter = 'ALL' | 'WIN_GOALS' | 'DC_GOALS' | 'BTTS_COMBOS';

const MARKET_CATEGORY_META: Array<{ id: Exclude<MarketCategoryFilter, 'ALL'>; label: string }> = [
  { id: 'MAIN', label: 'Main' },
  { id: 'TOTALS', label: 'Totals' },
  { id: 'COMBOS', label: 'Combos' },
  { id: 'TEAM', label: 'Team Goals' },
  { id: 'SPECIALS', label: 'Specials' },
];

const COMBO_SUBFILTER_META: Array<{ id: ComboSubFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'WIN_GOALS', label: 'Win & Goals' },
  { id: 'DC_GOALS', label: 'DC & Goals' },
  { id: 'BTTS_COMBOS', label: 'BTTS Combos' },
];

function getComboSubGroup(key: string): Exclude<ComboSubFilter, 'ALL'> {
  if (key.includes('BTTS')) return 'BTTS_COMBOS';
  if (key.startsWith('COMBO_1X_') || key.startsWith('COMBO_X2_') || key.startsWith('COMBO_12_')) return 'DC_GOALS';
  return 'WIN_GOALS';
}

const MARKET_KEY_SORT_ORDER: Record<string, number> = {
  HOME_WIN: 1,
  DRAW: 2,
  AWAY_WIN: 3,
  BTTS_YES: 1,
  BTTS_NO: 2,
  DOUBLE_CHANCE_1X: 1,
  DOUBLE_CHANCE_12: 2,
  DOUBLE_CHANCE_X2: 3,
  DNB_HOME: 1,
  DNB_AWAY: 2,
  OVER_15: 1,
  UNDER_15: 2,
  OVER_25: 3,
  UNDER_25: 4,
  OVER_35: 5,
  UNDER_35: 6,
  OVER_45: 7,
  UNDER_45: 8,
  HOME_OVER_15: 1,
  HOME_UNDER_15: 2,
  HOME_OVER_25: 3,
  HOME_UNDER_25: 4,
  AWAY_OVER_15: 5,
  AWAY_UNDER_15: 6,
  AWAY_OVER_25: 7,
  AWAY_UNDER_25: 8,
  HOME_CLEAN_SHEET: 9,
  AWAY_CLEAN_SHEET: 10,
  HANDICAP_HOME_MINUS_1: 1,
  HANDICAP_AWAY_MINUS_1: 2,
  MULTIGOALS_1_3: 3,
  MULTIGOALS_2_4: 4,
  MULTIGOALS_2_5: 5,
  GOALS_ODD: 6,
  GOALS_EVEN: 7,
};

function getMarketSectionInfo(key: string): {
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  columnsClass: string;
  category: Exclude<MarketCategoryFilter, 'ALL'>;
} {
  if (key === 'HOME_WIN' || key === 'DRAW' || key === 'AWAY_WIN') {
    return { sectionId: '1x2', sectionTitle: '1X2', sectionOrder: 1, columnsClass: 'grid-cols-3', category: 'MAIN' };
  }
  if (key.startsWith('BTTS_')) {
    return { sectionId: 'btts', sectionTitle: 'Both Teams to Score', sectionOrder: 2, columnsClass: 'grid-cols-2', category: 'MAIN' };
  }
  if (key.startsWith('DOUBLE_CHANCE_')) {
    return { sectionId: 'double-chance', sectionTitle: 'Double Chance', sectionOrder: 3, columnsClass: 'grid-cols-2', category: 'MAIN' };
  }
  if (key.startsWith('DNB_')) {
    return { sectionId: 'dnb', sectionTitle: 'Draw No Bet', sectionOrder: 4, columnsClass: 'grid-cols-2', category: 'MAIN' };
  }
  if (key.startsWith('OVER_') || key.startsWith('UNDER_')) {
    return { sectionId: 'totals', sectionTitle: 'Goals Over/Under', sectionOrder: 5, columnsClass: 'grid-cols-2', category: 'TOTALS' };
  }
  if (key.startsWith('COMBO_') || key === 'HOME_WIN_TO_NIL' || key === 'AWAY_WIN_TO_NIL') {
    return { sectionId: 'combos', sectionTitle: 'Combos', sectionOrder: 6, columnsClass: 'grid-cols-1 sm:grid-cols-2', category: 'COMBOS' };
  }
  if (key.startsWith('HOME_') || key.startsWith('AWAY_')) {
    return { sectionId: 'team', sectionTitle: 'Team Goals & Clean Sheets', sectionOrder: 7, columnsClass: 'grid-cols-2', category: 'TEAM' };
  }
  if (key.startsWith('MULTIGOALS_') || key.startsWith('GOALS_')) {
    return { sectionId: 'specials-goals', sectionTitle: 'Multi-Goals & Odd/Even', sectionOrder: 8, columnsClass: 'grid-cols-2', category: 'SPECIALS' };
  }
  return { sectionId: 'specials', sectionTitle: 'Handicaps & Specials', sectionOrder: 9, columnsClass: 'grid-cols-2', category: 'SPECIALS' };
}

function formatSportsbookMarketLabel(key: string, fullName: string): string {
  switch (key) {
    case 'HOME_WIN': return '1';
    case 'DRAW': return 'X';
    case 'AWAY_WIN': return '2';
    case 'BTTS_YES': return 'Yes';
    case 'BTTS_NO': return 'No';
    case 'DOUBLE_CHANCE_1X': return '1X';
    case 'DOUBLE_CHANCE_12': return '12';
    case 'DOUBLE_CHANCE_X2': return 'X2';
    case 'DNB_HOME': return '1 (DNB)';
    case 'DNB_AWAY': return '2 (DNB)';
    case 'OVER_15': return 'Over 1.5';
    case 'UNDER_15': return 'Under 1.5';
    case 'OVER_25': return 'Over 2.5';
    case 'UNDER_25': return 'Under 2.5';
    case 'OVER_35': return 'Over 3.5';
    case 'UNDER_35': return 'Under 3.5';
    case 'OVER_45': return 'Over 4.5';
    case 'UNDER_45': return 'Under 4.5';
    case 'MULTIGOALS_1_3': return '1 - 3 Goals';
    case 'MULTIGOALS_2_4': return '2 - 4 Goals';
    case 'MULTIGOALS_2_5': return '2 - 5 Goals';
    case 'GOALS_ODD': return 'Odd';
    case 'GOALS_EVEN': return 'Even';
    default:
      return fullName.replace(/\s+Goals$/i, '').replace(/^Multi-Goals:\s*/i, '');
  }
}

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
    <MatchDetailDrawerContent
      fixture={safeFixture}
      onClose={onClose}
      isPanel={isPanel}
      onAddSelection={onAddSelection}
      selectedSelections={selectedSelections}
    />
  );
};

export const MatchDetailDrawer: React.FC<{
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [fixture, onClose]);

  const displayFixture = fixture || lastFixtureRef.current;
  if (!displayFixture) return null;

  const drawerNode = (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`${displayFixture.homeTeam} vs ${displayFixture.awayTeam} details`}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-[100] lg:hidden w-full h-full rounded-none bg-theme-card flex flex-col overflow-hidden pointer-events-auto"
    >
      <MatchDetailView
        fixture={displayFixture}
        onClose={onClose}
        isPanel={false}
        onAddSelection={onAddSelection}
        selectedSelections={selectedSelections}
      />
    </motion.div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(drawerNode, document.body);
  }
  return drawerNode;
};

const MatchDetailDrawerContent: React.FC<{
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
  const [activeTab, setActiveTab] = useState<DetailTab>('OVERVIEW');
  const [statFilterGroup] = useState<StatCategoryGroup>('ALL');
  const [marketCategoryFilter, setMarketCategoryFilter] = useState<MarketCategoryFilter>('ALL');
  const [collapsedMarketSections, setCollapsedMarketSections] = useState<Record<string, boolean>>({});
  const [comboSubFilter, setComboSubFilter] = useState<ComboSubFilter>('ALL');

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
    setCollapsedMarketSections({});
    setComboSubFilter('ALL');
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

  // Synchronize live status, score, and minute updates from parent fixture updates
  useEffect(() => {
    setEnrichedFixture((prev) => {
      const statusChanged = fixture.status && fixture.status !== prev.status;
      const minuteChanged = fixture.minute !== undefined && fixture.minute !== prev.minute;
      const scoreChanged =
        fixture.score &&
        (fixture.score.home !== prev.score?.home || fixture.score.away !== prev.score?.away);

      if (!statusChanged && !minuteChanged && !scoreChanged) {
        return prev;
      }

      return {
        ...prev,
        status: fixture.status || prev.status,
        minute: fixture.minute !== undefined ? fixture.minute : prev.minute,
        score: fixture.score || prev.score,
      };
    });
  }, [fixture.status, fixture.minute, fixture.score?.home, fixture.score?.away]);

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

  const allMarketsList = useMemo(() => {
    if (!currentFixture.markets || currentFixture.markets.length === 0) return [];
    const dedupedByKey = new Map<string, MarketOption>();
    for (const market of currentFixture.markets) {
      if (/(?:^|_)05(?:_|$)/i.test(String(market.key))) continue;
      const existing = dedupedByKey.get(market.key);
      if (!existing || market.probability > existing.probability) {
        dedupedByKey.set(market.key, market);
      }
    }
    return Array.from(dedupedByKey.values()).map((market) => {
      const info = getMarketSectionInfo(market.key);
      return {
        groupName: info.sectionTitle,
        ...info,
        ...market,
      };
    });
  }, [currentFixture.markets]);

  const availableMarketTabs = useMemo<SegmentedTabItem<MarketCategoryFilter>[]>(() => {
    const counts: Record<Exclude<MarketCategoryFilter, 'ALL'>, number> = {
      MAIN: 0,
      TOTALS: 0,
      COMBOS: 0,
      TEAM: 0,
      SPECIALS: 0,
    };

    for (const m of allMarketsList) {
      counts[m.category] += 1;
    }
    if (pred?.topCorrectScores && pred.topCorrectScores.length > 0) {
      counts.SPECIALS += Math.min(6, pred.topCorrectScores.length);
    }

    const totalCount =
      allMarketsList.length + (pred?.topCorrectScores ? Math.min(6, pred.topCorrectScores.length) : 0);

    const tabs: SegmentedTabItem<MarketCategoryFilter>[] = [
      { id: 'ALL', label: 'All', count: totalCount },
    ];

    for (const meta of MARKET_CATEGORY_META) {
      if (counts[meta.id] > 0) {
        tabs.push({
          id: meta.id,
          label: meta.label,
          count: counts[meta.id],
        });
      }
    }

    return tabs;
  }, [allMarketsList, pred?.topCorrectScores]);

  useEffect(() => {
    if (marketCategoryFilter !== 'ALL' && !availableMarketTabs.some((t) => t.id === marketCategoryFilter)) {
      setMarketCategoryFilter('ALL');
    }
  }, [availableMarketTabs, marketCategoryFilter]);

  const bestMarketsPerGroup = useMemo(() => {
    if (allMarketsList.length === 0) return [];
    const groups: Record<string, (typeof allMarketsList)[number]> = {};
    allMarketsList.forEach((market) => {
      if (['UNDER_45', 'HOME_UNDER_25', 'AWAY_UNDER_25'].includes(market.key)) {
        return;
      }
      let group = '';
      if (['HOME_WIN', 'DRAW', 'AWAY_WIN'].includes(market.key)) group = '1X2';
      else if (market.key.startsWith('DOUBLE_CHANCE')) group = 'Double Chance';
      else if (market.key.startsWith('DNB')) group = 'Draw No Bet';
      else if (['OVER_25', 'UNDER_25'].includes(market.key)) group = 'Goals O/U 2.5';
      else if (market.key.startsWith('BTTS')) group = 'BTTS';
      else if (market.category === 'COMBOS') group = 'Combos';
      else if (market.key === 'HOME_OVER_15' || market.key === 'AWAY_OVER_15' || market.key === 'HOME_CLEAN_SHEET' || market.key === 'AWAY_CLEAN_SHEET') group = 'Team Markets';
      else if (market.key === 'MULTIGOALS_1_3' || market.key === 'MULTIGOALS_2_4') group = 'Multi-Goals';
      if (group && (!groups[group] || market.probability > groups[group].probability)) {
        groups[group] = market;
      }
    });
    return Object.entries(groups).map(([groupName, market]) => ({ ...market, groupName }));
  }, [allMarketsList]);

  const recommendedPick = useMemo(() => {
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
    const ml = currentFixture.mostLikelyOutcome || pred?.mostLikelyOutcome;
    if (ml?.marketKey) {
      const pct = getProbValue(ml.probability, 1);
      return {
        key: ml.marketKey,
        label: ml.selection,
        probability: ml.probability,
        probabilityPercent: pct,
        probabilityFormatted: `${pct.toFixed(1)}%`,
      };
    }
    if (currentFixture.highestPick?.key) {
      return {
        key: currentFixture.highestPick.key,
        label: currentFixture.highestPick.label,
        probability: currentFixture.highestPick.probability,
        probabilityPercent: currentFixture.highestPick.probabilityPercent,
        probabilityFormatted: currentFixture.highestPick.probabilityFormatted,
      };
    }
    if (currentFixture.authoritativePick) {
      return currentFixture.authoritativePick;
    }
    return null;
  }, [bestMarketsPerGroup, currentFixture.mostLikelyOutcome, pred?.mostLikelyOutcome, currentFixture.highestPick, currentFixture.authoritativePick]);

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
    { id: 'OVERVIEW' as DetailTab, label: 'Overview' },
    { id: 'H2H' as DetailTab, label: 'H2H', count: h2h.matchesCount > 0 ? h2h.matchesCount : undefined },
    {
      id: 'TEAMS' as DetailTab,
      label: 'Teams',
      count:
        homeRecentMatchesList.length + awayRecentMatchesList.length > 0
          ? homeRecentMatchesList.length + awayRecentMatchesList.length
          : undefined,
    },
    { id: 'STANDINGS' as DetailTab, label: 'Table' },
    {
      id: 'PREDICTIONS' as DetailTab,
      label: 'Preds',
      count: bestMarketsPerGroup.length > 0 ? bestMarketsPerGroup.length : undefined,
    },
    { id: 'TACTICS' as DetailTab, label: 'Tactics' },
  ];

  const panelContainer = (
    <div
      className="bg-theme-card text-theme-main flex flex-col overflow-hidden select-none h-full w-full rounded-none font-sans"
      style={{ scrollbarGutter: 'stable' }}
    >
      {/* Neon Gradient Header Band */}
      <div
        className={`bg-theme-header-grad border-b border-theme px-3 sm:px-4 pb-2 shrink-0 ${
          isPanel ? 'pt-1.5' : 'pt-[calc(env(safe-area-inset-top)+6px)]'
        }`}
      >
        <div className={!isPanel ? 'max-w-4xl mx-auto w-full' : ''}>
        <div className="min-h-[36px] flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 -ml-1.5 rounded-full hover:bg-theme-subtle text-theme-main transition-colors cursor-pointer flex items-center justify-center shrink-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
                aria-label="Back to matches"
                title="Back"
              >
                <ArrowLeft className="w-[18px] h-[18px] stroke-[2.25]" />
              </button>
            )}
            <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-x-auto no-scrollbar text-xs text-theme-sub">
              <span className="font-medium text-theme-main truncate whitespace-nowrap">
                {fixture.stage || fixture.leagueName}
              </span>
              <span aria-hidden="true" className="text-theme-dim shrink-0">·</span>
              <span className="tabular-nums font-normal text-theme-sub shrink-0">
                {formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp).dateStr}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void handleCopyText(`${fixture.homeTeam} vs ${fixture.awayTeam}`, 'MATCHUP')}
              title={`Copy "${fixture.homeTeam} vs ${fixture.awayTeam}"`}
              aria-label="Copy both team names"
              className="w-8 h-8 rounded-full hover:bg-theme-subtle text-theme-sub hover:text-theme-main transition-colors cursor-pointer flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
            >
              {copiedKey === 'MATCHUP' ? (
                <Check className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 stroke-[2.25]" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
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
                className="w-[20px] h-[20px] rounded-full text-theme-dim hover:text-theme-main hover:bg-theme-subtle transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              >
                {copiedKey === 'HOME' ? (
                  <Check className="w-3 h-3 text-emerald-700 dark:text-emerald-400 stroke-[2.25]" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
            {pred && (
              <span className="text-xs font-semibold tabular-nums text-theme-primary">
                {homeWinPct}%
              </span>
            )}
          </div>

          <div className="flex flex-col items-center shrink-0 px-1.5">
            <span className={`text-xl leading-none font-bold tabular-nums tracking-[-0.025em] ${
              (currentFixture.status || fixture.status) === 'LIVE' ? 'text-rose-600 dark:text-rose-400' : 'text-theme-main'
            }`}>
              {(currentFixture.score || fixture.score) ? `${(currentFixture.score || fixture.score)!.home} - ${(currentFixture.score || fixture.score)!.away}` : 'VS'}
            </span>
            {(currentFixture.status || fixture.status) === 'LIVE' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/20 mt-1 tabular-nums whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                <span>{(currentFixture.minute ?? fixture.minute) ? `${currentFixture.minute ?? fixture.minute}'` : 'LIVE'}</span>
              </span>
            ) : (currentFixture.status || fixture.status) === 'FINISHED' ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 mt-1 tabular-nums whitespace-nowrap">
                FT
              </span>
            ) : (
              <span className="text-2xs font-medium text-theme-sub uppercase tracking-[0.06em] mt-1 tabular-nums">
                {formatMatchDateTime(fixture.matchDate, fixture.kickOffTime, fixture.timestamp).timeStr}
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
                className="w-[20px] h-[20px] rounded-full text-theme-dim hover:text-theme-main hover:bg-theme-subtle transition-colors cursor-pointer inline-flex items-center justify-center shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent"
              >
                {copiedKey === 'AWAY' ? (
                  <Check className="w-3 h-3 text-emerald-700 dark:text-emerald-400 stroke-[2.25]" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </button>
            </div>
            {pred && (
              <span className="text-xs font-semibold tabular-nums text-sky-700 dark:text-sky-400">
                {awayWinPct}%
              </span>
            )}
          </div>
        </div>

        <div className="mt-1.5">
          <SegmentedTabs<DetailTab>
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
      </div>

      {/* Scrollable Content Body */}
      <div
        className={`overflow-y-auto overscroll-contain flex-1 min-h-0 min-w-0 ${
          isPanel ? 'p-3' : 'p-3 sm:p-4 pb-[calc(env(safe-area-inset-bottom)+20px)]'
        }`}
      >
        <div className={!isPanel ? 'max-w-4xl mx-auto w-full space-y-2.5' : 'space-y-2.5'}>
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
                        <span className="text-sky-700 dark:text-sky-400">{pred?.awayXG ?? '-'}</span>
                      </div>
                    </div>

                    {pred?.teamStrength ? (
                      <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                        <span className="text-theme-sub font-normal">Team Strength Index</span>
                        <div className="font-semibold text-theme-main">
                          <span className="text-theme-primary">{pred.teamStrength.homeStrengthRating}</span>
                          <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">vs</span>
                          <span className="text-sky-700 dark:text-sky-400">{pred.teamStrength.awayStrengthRating}</span>
                        </div>
                      </div>
                    ) : pred?.eloRatings ? (
                      <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between">
                        <span className="text-theme-sub font-normal">Elo Ratings</span>
                        <div className="font-semibold text-theme-main">
                          <span className="text-theme-primary">{pred.eloRatings.homeElo}</span>
                          <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">vs</span>
                          <span className="text-sky-700 dark:text-sky-400">{pred.eloRatings.awayElo}</span>
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
                          <span className="text-sky-700 dark:text-sky-400">
                            {pred.standingsContext.away
                              ? `#${pred.standingsContext.away.rank}/${pred.standingsContext.away.totalTeams} (${pred.standingsContext.away.ppg.toFixed(2)})`
                              : '-'}
                          </span>
                        </div>
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

                    {pred?.volatilityContext && (
                      <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between gap-2">
                        <span className="text-theme-sub font-normal">League Volatility (V_L / T)</span>
                        <div className="font-semibold text-theme-main shrink-0">
                          <span className="text-theme-primary">
                            V_L {pred.volatilityContext.volatilityCoefficient.toFixed(2)}
                          </span>
                          <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">·</span>
                          <span>T {pred.volatilityContext.temperature.toFixed(2)}</span>
                          {pred.volatilityContext.isFallback && (
                            <span className="text-theme-dim font-normal text-xs pl-1.5">(Fallback)</span>
                          )}
                        </div>
                      </div>
                    )}

                    {pred?.monteCarlo && (
                      <div className="min-h-[32px] px-3 py-1.5 flex items-center justify-between gap-2">
                        <span className="text-theme-sub font-normal">Monte Carlo xG (P10–P90)</span>
                        <div className="font-semibold text-theme-main shrink-0">
                          <span className="text-theme-primary">
                            {pred.monteCarlo.homeGoalsP10.toFixed(2)}–{pred.monteCarlo.homeGoalsP90.toFixed(2)}
                          </span>
                          <span aria-hidden="true" className="text-theme-dim px-1.5 font-normal">vs</span>
                          <span className="text-sky-700 dark:text-sky-400">
                            {pred.monteCarlo.awayGoalsP10.toFixed(2)}–{pred.monteCarlo.awayGoalsP90.toFixed(2)}
                          </span>
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
                          enrichedFixture.marketOdds.bookmakersCount ? (
                            <span className="text-xs font-normal tabular-nums text-theme-dim">
                              {enrichedFixture.marketOdds.bookmakersCount} bookmakers
                            </span>
                          ) : undefined
                        }
                      />
                    </div>
                    <div className="grid grid-cols-3 divide-x divide-[var(--border-subdued)] text-center tabular-nums">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleAddBet('HOME_WIN', `Home Win (${fixture.homeTeam})`, enrichedFixture.marketOdds?.homeOdds)}
                        className={`min-h-[58px] py-2 px-2 flex flex-col justify-center transition-colors ${
                          isSel('HOME_WIN')
                            ? 'bg-theme-primary/15 ring-2 ring-theme-primary cursor-pointer'
                            : 'hover:bg-theme-card-elevated cursor-pointer'
                        }`}
                      >
                        <span className="text-xs font-medium text-theme-sub block">1 (Home)</span>
                        <span className="text-lg font-bold text-theme-primary block mt-0.5 tracking-[-0.015em]">
                          {enrichedFixture.marketOdds.homeOdds ? enrichedFixture.marketOdds.homeOdds.toFixed(2) : '-'}
                        </span>
                        <span className="text-xs font-normal text-theme-dim block">
                          {enrichedFixture.marketOdds.homeImpliedProb !== undefined
                            ? `${(enrichedFixture.marketOdds.homeImpliedProb * 100).toFixed(1)}%`
                            : '-'}
                        </span>
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleAddBet('DRAW', 'Draw (X)', enrichedFixture.marketOdds?.drawOdds)}
                        className={`min-h-[58px] py-2 px-2 flex flex-col justify-center transition-colors ${
                          isSel('DRAW')
                            ? 'bg-theme-primary/15 ring-2 ring-theme-primary cursor-pointer'
                            : 'hover:bg-theme-card-elevated cursor-pointer'
                        }`}
                      >
                        <span className="text-xs font-medium text-theme-sub block">X (Draw)</span>
                        <span className="text-lg font-bold text-amber-700 dark:text-amber-400 block mt-0.5 tracking-[-0.015em]">
                          {enrichedFixture.marketOdds.drawOdds ? enrichedFixture.marketOdds.drawOdds.toFixed(2) : '-'}
                        </span>
                        <span className="text-xs font-normal text-theme-dim block">
                          {enrichedFixture.marketOdds.drawImpliedProb !== undefined
                            ? `${(enrichedFixture.marketOdds.drawImpliedProb * 100).toFixed(1)}%`
                            : '-'}
                        </span>
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => handleAddBet('AWAY_WIN', `Away Win (${fixture.awayTeam})`, enrichedFixture.marketOdds?.awayOdds)}
                        className={`min-h-[58px] py-2 px-2 flex flex-col justify-center transition-colors ${
                          isSel('AWAY_WIN')
                            ? 'bg-theme-primary/15 ring-2 ring-theme-primary cursor-pointer'
                            : 'hover:bg-theme-card-elevated cursor-pointer'
                        }`}
                      >
                        <span className="text-xs font-medium text-theme-sub block">2 (Away)</span>
                        <span className="text-lg font-bold text-sky-700 dark:text-sky-400 block mt-0.5 tracking-[-0.015em]">
                          {enrichedFixture.marketOdds.awayOdds ? enrichedFixture.marketOdds.awayOdds.toFixed(2) : '-'}
                        </span>
                        <span className="text-xs font-normal text-theme-dim block">
                          {enrichedFixture.marketOdds.awayImpliedProb !== undefined
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
                    {(enrichedFixture.marketOdds.over25Odds ||
                      enrichedFixture.marketOdds.under25Odds ||
                      enrichedFixture.marketOdds.bttsYesOdds ||
                      enrichedFixture.marketOdds.bttsNoOdds) && (
                      <div className="border-t border-theme-subdued grid grid-cols-2 divide-x divide-y divide-[var(--border-subdued)] text-xs tabular-nums">
                        {([
                          { key: 'OVER_25', label: 'Over 2.5', val: enrichedFixture.marketOdds.over25Odds, name: 'Over 2.5 Goals' },
                          { key: 'UNDER_25', label: 'Under 2.5', val: enrichedFixture.marketOdds.under25Odds, name: 'Under 2.5 Goals' },
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
                      accentClass: 'text-sky-700 dark:text-sky-400',
                      winBgClass: 'bg-sky-600 text-white',
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
                                    className={`w-[16px] h-[16px] rounded-full inline-flex items-center justify-center text-2xs leading-none font-bold ${
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
                            className={`min-w-[38px] h-[21px] inline-flex items-center justify-center px-2 rounded-full text-xs font-bold leading-none ${
                              isHomeWinner
                                ? 'bg-theme-primary-subtle text-theme-primary'
                                : isAwayWinner
                                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-400'
                                : 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
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
                winBgClass: 'bg-sky-600 text-white',
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
                          className={`w-[19px] h-[19px] rounded-full text-2xs leading-none font-bold flex items-center justify-center shrink-0 ${
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
                              className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-2xs leading-none font-bold shrink-0 ${
                                m.result === 'W'
                                  ? side.winBgClass
                                  : m.result === 'D'
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'bg-rose-600 text-white'
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
        {activeTab === 'PREDICTIONS' && (() => {
          type MarketTileItem = {
            key: string;
            shortLabel: string;
            fullName: string;
            probability: number;
            odds: number;
            isSelected: boolean;
          };

          type MarketSectionGroup = {
            sectionId: string;
            sectionTitle: string;
            sectionOrder: number;
            columnsClass: string;
            category: Exclude<MarketCategoryFilter, 'ALL'>;
            items: MarketTileItem[];
          };

          const sectionMap = new Map<string, MarketSectionGroup>();

          for (const market of allMarketsList) {
            if (marketCategoryFilter !== 'ALL' && market.category !== marketCategoryFilter) {
              continue;
            }
            const { odds: betOdds } = getOddsForMarket(market.key, market.probability);
            const tile: MarketTileItem = {
              key: market.key,
              shortLabel: formatSportsbookMarketLabel(market.key, market.name),
              fullName: market.name,
              probability: market.probability,
              odds: betOdds,
              isSelected: isSel(market.key),
            };
            const existing = sectionMap.get(market.sectionId);
            if (existing) {
              existing.items.push(tile);
            } else {
              sectionMap.set(market.sectionId, {
                sectionId: market.sectionId,
                sectionTitle: market.sectionTitle,
                sectionOrder: market.sectionOrder,
                columnsClass: market.columnsClass,
                category: market.category,
                items: [tile],
              });
            }
          }

          if (
            pred?.topCorrectScores &&
            pred.topCorrectScores.length > 0 &&
            (marketCategoryFilter === 'ALL' || marketCategoryFilter === 'SPECIALS')
          ) {
            sectionMap.set('correct-score', {
              sectionId: 'correct-score',
              sectionTitle: 'Correct Score',
              sectionOrder: 10,
              columnsClass: 'grid-cols-2 sm:grid-cols-3',
              category: 'SPECIALS',
              items: pred.topCorrectScores.slice(0, 6).map((cs) => {
                const csKey = `CORRECT_SCORE_${cs.homeGoals}_${cs.awayGoals}`;
                const { odds: csOdds } = getOddsForMarket(csKey, cs.probability);
                return {
                  key: csKey,
                  shortLabel: cs.score,
                  fullName: `Correct Score ${cs.score}`,
                  probability: cs.probability,
                  odds: csOdds,
                  isSelected: isSel(csKey),
                };
              }),
            });
          }

          const sections = Array.from(sectionMap.values())
            .sort((a, b) => a.sectionOrder - b.sectionOrder)
            .map((section) => {
              if (section.sectionId === 'combos') {
                const sortedCombos = section.items.slice().sort((a, b) => b.probability - a.probability);
                return { ...section, items: sortedCombos };
              }
              const sorted = section.items.slice().sort((a, b) => {
                const orderA = MARKET_KEY_SORT_ORDER[a.key] ?? 999;
                const orderB = MARKET_KEY_SORT_ORDER[b.key] ?? 999;
                if (orderA !== orderB) return orderA - orderB;
                return b.probability - a.probability;
              });
              return { ...section, items: sorted };
            });

          const toggleSection = (sectionId: string) => {
            setCollapsedMarketSections((prev) => ({
              ...prev,
              [sectionId]: !prev[sectionId],
            }));
          };

          return (
            <div className="space-y-2.5">
              {/* Clickable Top Model Recommendation Card (No separate Add to Slip button) */}
              {recommendedPick && (() => {
                const authKey = recommendedPick.key;
                const { odds: authOdds } = getOddsForMarket(authKey, recommendedPick.probability);
                const isAuthSelected = isSel(authKey);
                return (
                  <button
                    type="button"
                    onClick={() => handleAddBet(authKey, recommendedPick.label, authOdds)}
                    aria-pressed={isAuthSelected}
                    aria-label={`${recommendedPick.label} — ${recommendedPick.probabilityFormatted}, odds ${authOdds.toFixed(2)}${isAuthSelected ? ' (Selected in Bet Slip)' : ''}`}
                    className={`w-full rounded-2xl border px-3.5 py-2.5 text-left transition-all duration-150 cursor-pointer flex items-center justify-between gap-3 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                      isAuthSelected
                        ? 'bg-theme-primary text-theme-primary-text border-theme-primary shadow-theme-glow'
                        : 'bg-theme-card-elevated hover:bg-theme-subtle border-theme-primary/35 text-theme-main shadow-theme-sm'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {isAuthSelected && <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />}
                        <span
                          className={`text-2xs font-bold uppercase tracking-[0.06em] ${
                            isAuthSelected ? 'text-theme-primary-text/90' : 'text-theme-primary'
                          }`}
                        >
                          Model Recommendation
                        </span>
                      </div>
                      <div className="text-base font-bold tracking-[-0.01em] truncate mt-0.5">
                        {recommendedPick.label}
                      </div>
                    </div>

                    <div className="text-right tabular-nums shrink-0 leading-tight">
                      <span
                        className={`block text-base font-bold ${
                          isAuthSelected ? 'text-theme-primary-text' : 'text-theme-primary'
                        }`}
                      >
                        {authOdds.toFixed(2)}
                      </span>
                      <span
                        className={`block text-xs font-semibold mt-0.5 ${
                          isAuthSelected ? 'text-theme-primary-text/90' : 'text-theme-main'
                        }`}
                      >
                        {recommendedPick.probabilityFormatted}
                      </span>
                    </div>
                  </button>
                );
              })()}

              {/* Sportsbook Grouped Market Predictions Container */}
              <Card surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
                {/* Top Horizontal Underline Filter Bar */}
                {availableMarketTabs.length > 1 && (
                  <div
                    role="tablist"
                    aria-label="Filter match predictions by market"
                    className="px-2 border-b border-theme-subdued flex items-center gap-1 overflow-x-auto no-scrollbar bg-theme-card"
                  >
                    {availableMarketTabs.map((tab) => {
                      const isActive = marketCategoryFilter === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => {
                            setMarketCategoryFilter(tab.id);
                            if (tab.id === 'COMBOS') {
                              setComboSubFilter('ALL');
                            }
                          }}
                          className={`relative min-h-[42px] px-3 text-xs font-bold uppercase tracking-[0.05em] whitespace-nowrap shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-theme-accent ${
                            isActive
                              ? 'text-theme-primary'
                              : 'text-theme-sub hover:text-theme-main'
                          }`}
                        >
                          <span>{tab.label}</span>
                          {isActive && (
                            <span
                              aria-hidden="true"
                              className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-theme-primary"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Collapsible Market Sections */}
                {sections.length === 0 ? (
                  <div className="py-6 text-center text-sm text-theme-sub">No predictions computed</div>
                ) : (
                  <div className="divide-y divide-[var(--border-subdued)]">
                    {sections.map((section) => {
                      const isCollapsed = Boolean(collapsedMarketSections[section.sectionId]);
                      const isCombosSection = section.sectionId === 'combos';
                      const visibleItems =
                        isCombosSection && comboSubFilter !== 'ALL'
                          ? section.items.filter((item) => getComboSubGroup(item.key) === comboSubFilter)
                          : section.items;

                      return (
                        <section key={section.sectionId} aria-labelledby={`section-heading-${section.sectionId}`}>
                          <button
                            id={`section-heading-${section.sectionId}`}
                            type="button"
                            onClick={() => toggleSection(section.sectionId)}
                            aria-expanded={!isCollapsed}
                            aria-controls={`section-body-${section.sectionId}`}
                            className="w-full min-h-[44px] px-3.5 py-2.5 flex items-center justify-between gap-2 text-left hover:bg-theme-subtle/40 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-theme-accent"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-bold uppercase tracking-[0.04em] text-theme-main truncate">
                                {section.sectionTitle}
                              </span>
                            </div>
                            <ChevronDown
                              className={`w-4 h-4 text-theme-primary shrink-0 transition-transform duration-150 ${
                                !isCollapsed ? 'rotate-180' : ''
                              }`}
                            />
                          </button>

                          <AnimatePresence initial={false}>
                            {!isCollapsed && (
                              <motion.div
                                id={`section-body-${section.sectionId}`}
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                className="overflow-hidden"
                              >
                                {isCombosSection && section.items.length > 0 && (
                                  <div className="px-3.5 pb-2.5 flex items-center gap-1 overflow-x-auto no-scrollbar">
                                    <div className="flex items-center gap-1 p-0.5 bg-theme-subtle rounded-full border border-theme-subdued">
                                      {COMBO_SUBFILTER_META.map((sub) => {
                                        const subCount =
                                          sub.id === 'ALL'
                                            ? section.items.length
                                            : section.items.filter((c) => getComboSubGroup(c.key) === sub.id).length;
                                        if (sub.id !== 'ALL' && subCount === 0) return null;
                                        const isSubActive = comboSubFilter === sub.id;
                                        return (
                                          <button
                                            key={sub.id}
                                            type="button"
                                            onClick={() => setComboSubFilter(sub.id)}
                                            className={`h-[26px] px-2.5 rounded-full text-2xs font-semibold whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                                              isSubActive
                                                ? 'bg-theme-primary text-theme-primary-text shadow-theme-sm'
                                                : 'text-theme-sub hover:text-theme-main'
                                            }`}
                                          >
                                            {sub.label} ({subCount})
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                <div className={`px-3.5 pb-3.5 pt-0.5 grid gap-2 ${section.columnsClass}`}>
                                  {visibleItems.map((item) => {
                                    const probPct = (item.probability * 100).toFixed(1);
                                    const isHighProb = item.probability >= 0.65;
                                    return (
                                      <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => handleAddBet(item.key, item.fullName, item.odds)}
                                        aria-pressed={item.isSelected}
                                        title={item.fullName}
                                        aria-label={`${item.fullName} — ${probPct}% probability, odds ${item.odds.toFixed(2)}${item.isSelected ? ' (Selected)' : ''}`}
                                        className={`min-h-[44px] px-3 py-2 rounded-xl border transition-all duration-150 cursor-pointer flex items-center justify-between gap-2 text-left active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                                          item.isSelected
                                            ? 'bg-theme-primary text-theme-primary-text border-theme-primary shadow-theme-sm'
                                            : 'bg-theme-subtle/75 hover:bg-theme-card-elevated border-theme-subdued text-theme-main'
                                        }`}
                                      >
                                        <div className="min-w-0 flex items-center gap-1.5">
                                          {item.isSelected && (
                                            <Check className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
                                          )}
                                          <span className="text-sm font-semibold truncate">
                                            {item.shortLabel}
                                          </span>
                                        </div>

                                        <div className="text-right tabular-nums shrink-0 leading-tight">
                                          <span
                                            className={`block text-sm font-bold ${
                                              item.isSelected ? 'text-theme-primary-text' : 'text-theme-primary'
                                            }`}
                                          >
                                            {item.odds.toFixed(2)}
                                          </span>
                                          <span
                                            className={`block text-2xs font-semibold mt-0.5 ${
                                              item.isSelected
                                                ? 'text-theme-primary-text/90'
                                                : isHighProb
                                                ? 'text-theme-main'
                                                : 'text-theme-sub'
                                            }`}
                                          >
                                            {probPct}%
                                          </span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </section>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          );
        })()}

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
    </div>
  );

  return panelContainer;
};
