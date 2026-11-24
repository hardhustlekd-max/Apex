import React, { useState } from 'react';
import { BetSelection, SlipBet } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { Button } from './ui/index.js';
import { Ticket, Trash2, X, ChevronUp, ChevronDown, CheckCircle2, Coins } from 'lucide-react';

interface BetSlipDrawerProps {
  selections: BetSelection[];
  onRemoveSelection: (fixtureId: string) => void;
  onClearSelections: () => void;
  onBetPlaced: () => void;
  showToast: (msg: string, type?: 'success' | 'info') => void;
}

export const BetSlipDrawer: React.FC<BetSlipDrawerProps> = ({
  selections,
  onRemoveSelection,
  onClearSelections,
  onBetPlaced,
  showToast,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [stake, setStake] = useState<string>('100');
  const [isPlacing, setIsPlacing] = useState<boolean>(false);

  if (selections.length === 0) return null;

  const totalOdds = selections.reduce((acc, s) => acc * Math.max(1.01, s.odds), 1.0);
  const numericStake = parseFloat(stake) || 0;
  const potentialWin = numericStake * totalOdds;

  const handlePlaceBet = async () => {
    if (numericStake <= 0) {
      showToast('Please enter a valid stake amount in Birr', 'info');
      return;
    }

    const bet: SlipBet = {
      id: `bet_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      stake: numericStake,
      totalOdds: Number(totalOdds.toFixed(2)),
      potentialWin: Number(potentialWin.toFixed(2)),
      currency: 'Birr',
      status: 'PENDING',
      selections,
      placedAt: new Date().toISOString(),
    };

    try {
      setIsPlacing(true);
      const res = await EngineService.saveBet(bet);
      if (res.success) {
        showToast(`Bet placed successfully for ${numericStake.toFixed(2)} Birr!`, 'success');
        onClearSelections();
        onBetPlaced();
      } else {
        showToast(res.error || 'Failed to place bet', 'info');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error placing bet', 'info');
    } finally {
      setIsPlacing(false);
    }
  };

  return (
    <aside
      aria-label="Bet slip builder tray"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+60px)] lg:bottom-4 right-3 lg:right-4 z-50 w-[calc(100vw-24px)] max-w-sm bg-theme-card border border-theme rounded-2xl shadow-theme-md overflow-hidden font-sans animate-in slide-in-from-bottom-4 duration-200"
    >
      {/* Header Bar */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        className="min-h-[40px] px-3.5 py-2 bg-theme-header-grad border-b border-theme-subdued flex items-center justify-between gap-2 cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          <Ticket className="w-4 h-4 text-theme-primary shrink-0" />
          <span className="font-semibold text-sm text-theme-main">
            Bet Slip ({selections.length})
          </span>
          <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-theme-primary/15 text-theme-primary">
            {selections.length > 1 ? `Combo (${selections.length}-Fold)` : 'Single'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-theme-primary tabular-nums">
            {totalOdds.toFixed(2)}x
          </span>
          {isExpanded ? <ChevronDown className="w-4 h-4 text-theme-sub" /> : <ChevronUp className="w-4 h-4 text-theme-sub" />}
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-3 bg-theme-card">
          <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1 no-scrollbar divide-y divide-[var(--border-subdued)]">
            {selections.map((sel) => (
              <div key={sel.fixtureId} className="pt-2 first:pt-0 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-theme-main truncate">{sel.homeTeam} vs {sel.awayTeam}</div>
                  <div className="text-theme-primary font-medium">{sel.marketName}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-bold text-theme-main tabular-nums">{sel.odds.toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveSelection(sel.fixtureId);
                    }}
                    className="text-theme-dim hover:text-rose-600 dark:hover:text-rose-400 transition-colors p-1 cursor-pointer"
                    aria-label="Remove selection"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-theme-subdued pt-2.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-theme-sub">Stake (Birr):</span>
              <div className="relative w-[130px]">
                <input
                  type="number"
                  min="1"
                  step="10"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="w-full h-[32px] px-2.5 bg-theme-subtle border border-theme rounded-xl text-xs font-semibold text-theme-main text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-theme-accent"
                  placeholder="100"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 tabular-nums">
              {[50, 100, 250, 500].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setStake(String(preset))}
                  className={`h-[26px] rounded-full text-2xs font-semibold transition-colors cursor-pointer ${
                    numericStake === preset
                      ? 'bg-theme-primary text-theme-primary-text shadow-theme-sm'
                      : 'bg-theme-subtle text-theme-sub hover:text-theme-main border border-theme-subdued'
                  }`}
                >
                  {preset} Br
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between text-xs tabular-nums">
              <span className="text-theme-sub font-medium">Potential Payout:</span>
              <span className="font-bold text-base text-emerald-700 dark:text-emerald-400">
                {potentialWin.toFixed(2)} Birr
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="subtle"
                size="sm"
                onClick={onClearSelections}
                className="flex-1"
              >
                Clear
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handlePlaceBet()}
                disabled={isPlacing || selections.length === 0}
                className="flex-1"
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Place Bet</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
