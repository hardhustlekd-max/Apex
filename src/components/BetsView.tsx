import React, { useEffect, useState, useCallback } from 'react';
import { SlipBet } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { Card, SectionHeader, EmptyState, LoadingState, Badge, Button } from './ui/index.js';
import { Ticket, CheckCircle2, XCircle, Clock, RefreshCw, Coins, Trash2 } from 'lucide-react';

interface BetsViewProps {
  refreshKey?: number;
}

export const BetsView: React.FC<BetsViewProps> = ({ refreshKey = 0 }) => {
  const [bets, setBets] = useState<SlipBet[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'WON' | 'LOST'>('ALL');

  const loadBets = useCallback(async () => {
    try {
      setIsLoading(true);
      const list = await EngineService.getBets();
      setBets(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('Failed to load bets:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDeleteBet = async (id: string) => {
    try {
      await EngineService.deleteBet(id);
      setBets((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error('Failed to delete bet:', err);
    }
  };

  useEffect(() => {
    void loadBets();
  }, [loadBets, refreshKey]);

  const filteredBets = bets.filter((b) => (filterStatus === 'ALL' ? true : b.status === filterStatus));

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
        <SectionHeader
          title="My Bet Slips"
          icon={<Ticket className="w-4 h-4" />}
          size="md"
        />
        <Button variant="secondary" size="xs" onClick={() => void loadBets()} disabled={isLoading}>
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-theme-card border border-theme rounded-2xl p-3 shadow-theme-sm flex flex-col justify-between">
          <span className="text-2xs font-medium uppercase tracking-[0.06em] text-theme-sub">Total Bets</span>
          <span className="text-xl font-bold text-theme-main tabular-nums mt-1">{stats.total}</span>
        </div>
        <div className="bg-theme-card border border-theme rounded-2xl p-3 shadow-theme-sm flex flex-col justify-between">
          <span className="text-2xs font-medium uppercase tracking-[0.06em] text-theme-sub">Pending</span>
          <span className="text-xl font-bold text-amber-500 tabular-nums mt-1">{stats.pending}</span>
        </div>
        <div className="bg-theme-card border border-theme rounded-2xl p-3 shadow-theme-sm flex flex-col justify-between">
          <span className="text-2xs font-medium uppercase tracking-[0.06em] text-theme-sub">Won</span>
          <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">{stats.won}</span>
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
      <div className="flex items-center gap-1 p-1 bg-theme-subtle border border-theme-subdued rounded-xl w-fit">
        {(['ALL', 'PENDING', 'WON', 'LOST'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setFilterStatus(st)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              filterStatus === st
                ? 'bg-theme-primary text-theme-primary-text shadow-theme-sm'
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
            return (
              <Card key={bet.id} surface="elevated" padding="none" radius="2xl" className="overflow-hidden">
                <div className="px-3.5 py-2 bg-theme-header-grad border-b border-theme-subdued flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-theme-dim">#{bet.id.slice(-6).toUpperCase()}</span>
                    <span className="text-xs font-normal text-theme-sub">{placedDate}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
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
                        <span>Pending Evaluation</span>
                      </Badge>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteBet(bet.id)}
                      className="w-[26px] h-[26px] rounded-lg text-theme-dim hover:text-rose-500 hover:bg-theme-subtle flex items-center justify-center transition-colors cursor-pointer"
                      title="Delete bet slip"
                      aria-label="Delete bet slip"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-[var(--border-subdued)]">
                  {bet.selections.map((sel, sIdx) => (
                    <div key={sIdx} className="px-3.5 py-2 flex items-center justify-between gap-2 text-sm tabular-nums">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-theme-sub truncate font-medium">{sel.leagueName}</div>
                        <div className="font-semibold text-theme-main truncate tracking-[-0.01em]">
                          {sel.homeTeam} vs {sel.awayTeam}
                        </div>
                        <div className="text-xs text-theme-primary font-medium mt-0.5">
                          Pick: {sel.marketName}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span className="font-bold text-theme-main text-base">{sel.odds.toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="px-3.5 py-2.5 bg-theme-card-elevated border-t border-theme-subdued flex items-center justify-between gap-2 tabular-nums text-sm">
                  <div className="flex items-center gap-3">
                    <div>
                      <span className="text-2xs text-theme-sub uppercase block">Stake</span>
                      <span className="font-bold text-theme-main">{bet.stake.toFixed(2)} {bet.currency}</span>
                    </div>
                    <div>
                      <span className="text-2xs text-theme-sub uppercase block">Total Odds</span>
                      <span className="font-bold text-theme-primary">{bet.totalOdds.toFixed(2)}x</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-2xs text-theme-sub uppercase block">Potential Payout</span>
                    <span className={`font-bold text-base ${bet.status === 'WON' ? 'text-emerald-600 dark:text-emerald-400' : 'text-theme-main'}`}>
                      {bet.potentialWin.toFixed(2)} {bet.currency}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
