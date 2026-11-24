import React, { useEffect, useState, useCallback, useRef } from 'react';
import { SlipBet } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { formatMatchDateTime } from '../core/dateUtils.js';
import { Card, SectionHeader, EmptyState, LoadingState, Badge, Button } from './ui/index.js';
import {
  Ticket,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Coins,
  Trash2,
  ChevronDown,
  ChevronsUpDown,
} from 'lucide-react';

interface BetsViewProps {
  refreshKey?: number;
}

export const BetsView: React.FC<BetsViewProps> = ({ refreshKey = 0 }) => {
  const [bets, setBets] = useState<SlipBet[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLiveSyncing, setIsLiveSyncing] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'WON' | 'LOST'>('ALL');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const hasLoadedOnceRef = useRef<boolean>(false);
  const isFetchingRef = useRef<boolean>(false);

  const loadBets = useCallback(async (isSilent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const showSkeleton = !isSilent && !hasLoadedOnceRef.current;
      if (showSkeleton) setIsLoading(true);
      else setIsLiveSyncing(true);

      const list = await EngineService.getBets();
      const safeList = Array.isArray(list) ? list : [];
      hasLoadedOnceRef.current = true;

      setBets((prev) => {
        if (prev.length === safeList.length && JSON.stringify(prev) === JSON.stringify(safeList)) {
          return prev;
        }
        return safeList;
      });
    } catch (err) {
      console.error('Failed to load bets:', err);
    } finally {
      isFetchingRef.current = false;
      setIsLoading(false);
      setIsLiveSyncing(false);
    }
  }, []);

  const handleDeleteBet = async (id: string) => {
    try {
      await EngineService.deleteBet(id);
      setBets((prev) => prev.filter((b) => b.id !== id));
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      console.error('Failed to delete bet:', err);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredBets = bets.filter((b) => (filterStatus === 'ALL' ? true : b.status === filterStatus));
  const allExpanded = filteredBets.length > 0 && filteredBets.every((b) => expandedIds.has(b.id));

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const b of filteredBets) next.delete(b.id);
        return next;
      });
    } else {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const b of filteredBets) next.add(b.id);
        return next;
      });
    }
  };

  // Smooth silent background polling every 10s without resetting UI state or flashing skeletons
  useEffect(() => {
    void loadBets(hasLoadedOnceRef.current);

    const interval = setInterval(() => {
      void loadBets(true);
    }, 10000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadBets(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadBets, refreshKey]);

  const stats = {
    total: bets.length,
    pending: bets.filter((b) => b.status === 'PENDING').length,
    won: bets.filter((b) => b.status === 'WON').length,
    lost: bets.filter((b) => b.status === 'LOST').length,
    totalStaked: bets.reduce((acc, b) => acc + b.stake, 0),
    totalWon: bets.filter((b) => b.status === 'WON').reduce((acc, b) => acc + b.potentialWin, 0),
  };

  return (
    <div className="max-w-4xl mx-auto w-full space-y-3 font-sans">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <SectionHeader
            title="My Bet Slips"
            icon={<Ticket className="w-4 h-4" />}
            size="md"
          />
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
            <span className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${isLiveSyncing ? 'animate-ping' : 'animate-pulse'}`} />
            <span>Live Polling</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {filteredBets.length > 0 && (
            <Button
              variant="subtle"
              size="xs"
              onClick={toggleAll}
              title={allExpanded ? 'Collapse All Slips' : 'Expand All Slips'}
            >
              <ChevronsUpDown className="w-3.5 h-3.5" />
              <span>{allExpanded ? 'Collapse All' : 'Expand All'}</span>
            </Button>
          )}
          <Button variant="secondary" size="xs" onClick={() => void loadBets(true)} disabled={isLoading}>
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isLiveSyncing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-theme-card border border-theme rounded-2xl p-3 shadow-theme-sm flex flex-col justify-between">
          <span className="text-2xs font-medium uppercase tracking-[0.06em] text-theme-sub">Total Bets</span>
          <span className="text-xl font-bold text-theme-main tabular-nums mt-1">{stats.total}</span>
        </div>
        <div className="bg-theme-card border border-theme rounded-2xl p-3 shadow-theme-sm flex flex-col justify-between">
          <span className="text-2xs font-medium uppercase tracking-[0.06em] text-theme-sub">Pending</span>
          <span className="text-xl font-bold text-amber-700 dark:text-amber-400 tabular-nums mt-1">{stats.pending}</span>
        </div>
        <div className="bg-theme-card border border-theme rounded-2xl p-3 shadow-theme-sm flex flex-col justify-between">
          <span className="text-2xs font-medium uppercase tracking-[0.06em] text-theme-sub">Won</span>
          <span className="text-xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">{stats.won}</span>
        </div>
        <div className="bg-theme-card border border-theme rounded-2xl p-3 shadow-theme-sm flex flex-col justify-between">
          <span className="text-2xs font-medium uppercase tracking-[0.06em] text-theme-sub">Total Staked</span>
          <span className="text-xl font-bold text-theme-main tabular-nums mt-1 flex items-center gap-1">
            <Coins className="w-4 h-4 text-theme-primary" />
            <span>{stats.totalStaked.toFixed(2)} Birr</span>
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 p-[3px] bg-theme-subtle border border-theme-subdued rounded-full w-fit">
        {(['ALL', 'PENDING', 'WON', 'LOST'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setFilterStatus(st)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors cursor-pointer whitespace-nowrap ${
              filterStatus === st
                ? 'bg-theme-primary text-theme-primary-text border border-theme-neon shadow-theme-glow'
                : 'text-theme-sub hover:text-theme-main'
            }`}
          >
            {st.charAt(0) + st.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingState variant="skeleton" rows={4} />
      ) : filteredBets.length === 0 ? (
        <EmptyState
          icon={<Ticket className="w-8 h-8 text-theme-dim" />}
          title="No bet slips found"
          description="Build a betslip by selecting match odds and markets across the app and place your bets in Birr."
        />
      ) : (
        <div className="space-y-2.5">
          {filteredBets.map((bet) => {
            const placedDate = new Date(bet.placedAt).toLocaleString();
            const isExpanded = expandedIds.has(bet.id);
            const liveLegCount = bet.selections.filter((s) => s.matchStatus === 'LIVE').length;
            const settledLegCount = bet.selections.filter(
              (s) => (s.status || 'PENDING') !== 'PENDING' || s.matchStatus === 'FINISHED'
            ).length;

            return (
              <Card
                key={bet.id}
                surface="elevated"
                padding="none"
                radius="2xl"
                className={`overflow-hidden transition-all duration-200 ${
                  bet.status === 'WON'
                    ? 'border-l-4 border-emerald-500'
                    : bet.status === 'LOST'
                    ? 'border-l-4 border-rose-500'
                    : 'border-l-4 border-amber-500/50'
                }`}
              >
                {/* Accordion Header */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpand(bet.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleExpand(bet.id);
                    }
                  }}
                  className={`w-full px-3.5 py-3 bg-theme-header-grad flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-theme-card-elevated transition-colors ${
                    isExpanded ? 'border-b border-theme-subdued' : ''
                  }`}
                  aria-expanded={isExpanded}
                  aria-label={`Bet slip #${bet.id.slice(-6).toUpperCase()} ${bet.status.toLowerCase()}`}
                >
                  {/* Left: Expand Chevron + Slip Identity */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center text-theme-sub transition-transform duration-200 ${
                        isExpanded ? 'rotate-180 text-theme-primary' : ''
                      }`}
                    >
                      <ChevronDown className="w-4 h-4 stroke-[2.2]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono font-bold text-theme-main">
                          #{bet.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-theme-subtle text-theme-sub">
                          {bet.selections.length} {bet.selections.length === 1 ? 'Match' : 'Matches'}
                        </span>
                        {liveLegCount > 0 && (
                          <span className="inline-flex items-center gap-1 text-2xs font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                            <span>{liveLegCount} Live</span>
                          </span>
                        )}
                        {settledLegCount > 0 && settledLegCount < bet.selections.length && (
                          <span className="text-2xs font-medium text-theme-dim tabular-nums">
                            {settledLegCount}/{bet.selections.length} Settled
                          </span>
                        )}
                      </div>
                      <span className="text-2xs font-normal text-theme-dim block mt-0.5">
                        {placedDate}
                      </span>
                    </div>
                  </div>

                  {/* Center: Financial Quick Stats (visible on medium+ screens) */}
                  <div className="hidden sm:flex items-center gap-4 text-xs tabular-nums text-theme-sub">
                    <div>
                      <span className="text-2xs text-theme-dim uppercase block">Stake</span>
                      <span className="font-semibold text-theme-main">{bet.stake.toFixed(2)} {bet.currency}</span>
                    </div>
                    <div>
                      <span className="text-2xs text-theme-dim uppercase block">Odds</span>
                      <span className="font-bold text-theme-primary">{bet.totalOdds.toFixed(2)}x</span>
                    </div>
                    <div className="text-right">
                      <span className="text-2xs text-theme-dim uppercase block">Potential Win</span>
                      <span className={`font-bold ${bet.status === 'WON' ? 'text-emerald-700 dark:text-emerald-400' : 'text-theme-main'}`}>
                        {bet.potentialWin.toFixed(2)} {bet.currency}
                      </span>
                    </div>
                  </div>

                  {/* Right: Accordion Header Status Badge and Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {bet.status === 'WON' ? (
                      <Badge variant="success" size="sm">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Won</span>
                      </Badge>
                    ) : bet.status === 'LOST' ? (
                      <Badge variant="danger" size="sm">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Lost</span>
                      </Badge>
                    ) : (
                      <Badge variant="warning" size="sm">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Pending</span>
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDeleteBet(bet.id);
                      }}
                      className="w-[28px] h-[28px] rounded-full text-theme-dim hover:text-rose-600 dark:hover:text-rose-400 hover:bg-theme-subtle flex items-center justify-center transition-colors cursor-pointer"
                      title="Delete bet slip"
                      aria-label="Delete bet slip"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Accordion Expandable Content Body */}
                {isExpanded && (
                  <div className="animate-in fade-in duration-200">
                    <div className="divide-y divide-[var(--border-subdued)]">
                      {bet.selections.map((sel, sIdx) => {
                        const legStatus = sel.status || 'PENDING';
                        const hasScore = Boolean(
                          sel.score &&
                            typeof sel.score.home === 'number' &&
                            typeof sel.score.away === 'number'
                        );
                        const isMatchFinished =
                          sel.matchStatus === 'FINISHED' ||
                          legStatus === 'WON' ||
                          legStatus === 'LOST';
                        const isMatchLive = !isMatchFinished && sel.matchStatus === 'LIVE';
                        const isMatchVoid =
                          sel.matchStatus === 'CANCELLED' ||
                          sel.matchStatus === 'POSTPONED' ||
                          legStatus === 'VOID';
                        const { dateStr, timeStr } = formatMatchDateTime(
                          sel.matchDate,
                          sel.kickOffTime,
                          sel.timestamp
                        );

                        return (
                          <div
                            key={`${sel.fixtureId}_${sIdx}`}
                            className={`px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-sm tabular-nums transition-colors ${
                              legStatus === 'WON'
                                ? 'border-l-4 border-emerald-500 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]'
                                : legStatus === 'LOST'
                                ? 'border-l-4 border-rose-500 bg-rose-500/[0.04] hover:bg-rose-500/[0.08]'
                                : legStatus === 'VOID'
                                ? 'border-l-4 border-sky-500/60 bg-sky-500/[0.04] hover:bg-sky-500/[0.08]'
                                : isMatchLive
                                ? 'border-l-4 border-rose-500/70 bg-rose-500/[0.03] hover:bg-rose-500/[0.06]'
                                : 'border-l-4 border-amber-500/40 hover:bg-theme-card-elevated'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="text-xs text-theme-sub truncate font-medium flex items-center gap-1.5">
                                <span>{sel.leagueName}</span>
                                <span aria-hidden="true" className="text-theme-dim">·</span>
                                <span className="text-theme-dim">{dateStr} {timeStr}</span>
                                {isMatchLive && (
                                  <span className="inline-flex items-center gap-1 text-2xs font-bold text-rose-700 dark:text-rose-400">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                    <span>{sel.minute ? `${sel.minute}'` : 'LIVE'}</span>
                                  </span>
                                )}
                                {!isMatchLive && sel.matchStatus === 'FINISHED' && (
                                  <span className="text-2xs font-semibold text-theme-dim uppercase">FT</span>
                                )}
                                {!isMatchLive && sel.matchStatus === 'CANCELLED' && (
                                  <span className="text-2xs font-semibold text-sky-700 dark:text-sky-400 uppercase">Cancelled</span>
                                )}
                                {!isMatchLive && sel.matchStatus === 'POSTPONED' && (
                                  <span className="text-2xs font-semibold text-sky-700 dark:text-sky-400 uppercase">Postponed</span>
                                )}
                              </div>
                              <div className="font-semibold text-theme-main truncate tracking-[-0.01em] mt-0.5">
                                {sel.homeTeam} vs {sel.awayTeam}
                              </div>
                              <div className="text-xs text-theme-primary font-medium mt-0.5 flex items-center gap-1.5">
                                <span>Pick: {sel.marketName}</span>
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-3">
                              <div className="text-right">
                                <span className={`font-bold text-base block ${legStatus === 'VOID' ? 'line-through text-theme-dim' : 'text-theme-main'}`}>
                                  {sel.odds.toFixed(2)}
                                </span>
                                {legStatus === 'VOID' && (
                                  <span className="text-2xs font-semibold text-sky-700 dark:text-sky-400 block">
                                    1.00x Void
                                  </span>
                                )}
                                {hasScore ? (
                                  <span className={`text-xs font-semibold tabular-nums block mt-0.5 ${
                                    legStatus === 'WON'
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : legStatus === 'LOST'
                                      ? 'text-rose-700 dark:text-rose-400'
                                      : legStatus === 'VOID'
                                      ? 'text-sky-700 dark:text-sky-400'
                                      : isMatchLive
                                      ? 'text-rose-700 dark:text-rose-400 font-bold'
                                      : 'text-theme-sub'
                                  }`}>
                                    {isMatchFinished
                                      ? 'FT'
                                      : isMatchVoid
                                      ? sel.matchStatus === 'CANCELLED'
                                        ? 'CANC'
                                        : sel.matchStatus === 'POSTPONED'
                                        ? 'POSTP'
                                        : 'VOID'
                                      : sel.minute
                                      ? `Live ${sel.minute}'`
                                      : isMatchLive
                                      ? 'Live'
                                      : 'Score'}{' '}
                                    {sel.score!.home} - {sel.score!.away}
                                  </span>
                                ) : isMatchVoid ? (
                                  <span className="text-2xs font-semibold text-sky-700 dark:text-sky-400 uppercase block mt-0.5">
                                    {sel.matchStatus === 'CANCELLED' ? 'Cancelled' : sel.matchStatus === 'POSTPONED' ? 'Postponed' : 'Void'}
                                  </span>
                                ) : isMatchLive ? (
                                  <span className="text-2xs font-bold text-rose-700 dark:text-rose-400 uppercase block mt-0.5">
                                    {sel.minute ? `Live ${sel.minute}'` : 'Live'}
                                  </span>
                                ) : (
                                  <span className="text-2xs text-theme-dim uppercase block mt-0.5">
                                    {isMatchFinished ? 'FT' : timeStr}
                                  </span>
                                )}
                              </div>
                              <div>
                                {legStatus === 'WON' ? (
                                  <Badge variant="success" size="xs">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Won</span>
                                  </Badge>
                                ) : legStatus === 'LOST' ? (
                                  <Badge variant="danger" size="xs">
                                    <XCircle className="w-3 h-3" />
                                    <span>Lost</span>
                                  </Badge>
                                ) : legStatus === 'VOID' ? (
                                  <Badge variant="info" size="xs">
                                    <span>Void</span>
                                  </Badge>
                                ) : (
                                  <Badge variant="warning" size="xs">
                                    <Clock className="w-3 h-3" />
                                    <span>{isMatchLive ? 'In-Play' : 'Pending'}</span>
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Expanded Footer with Financial summary */}
                    <div className="px-3.5 py-2.5 bg-theme-card-elevated border-t border-theme-subdued flex items-center justify-between gap-2 tabular-nums text-sm flex-wrap">
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-2xs text-theme-sub uppercase block font-medium">Stake</span>
                          <span className="font-bold text-theme-main">
                            {bet.stake.toFixed(2)} {bet.currency}
                          </span>
                        </div>
                        <div>
                          <span className="text-2xs text-theme-sub uppercase block font-medium">Total Multiplier</span>
                          <span className="font-bold text-theme-primary">{bet.totalOdds.toFixed(2)}x</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-2xs text-theme-sub uppercase block font-medium">Potential Payout</span>
                        <span
                          className={`font-bold text-base ${
                            bet.status === 'WON'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-theme-main'
                          }`}
                        >
                          {bet.potentialWin.toFixed(2)} {bet.currency}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
