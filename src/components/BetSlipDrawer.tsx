import React, { useState, useRef } from 'react';
import { BetSelection, SlipBet } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { AppLogo, Button } from './ui/index.js';
import { Ticket, Trash2, X, ChevronUp, ChevronDown, CheckCircle2, Coins, Download } from 'lucide-react';
import { toPng } from 'html-to-image';

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
  const [isGeneratingPoster, setIsGeneratingPoster] = useState<boolean>(false);
  const posterRef = useRef<HTMLDivElement>(null);

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

  const formatShortPick = (marketKey: string, marketName: string): string => {
    const key = (marketKey || '').toUpperCase().trim();
    switch (key) {
      case 'HOME_WIN': return '1';
      case 'DRAW': return 'X';
      case 'AWAY_WIN': return '2';
      case 'DOUBLE_CHANCE_1X': return '1X';
      case 'DOUBLE_CHANCE_X2': return 'X2';
      case 'DOUBLE_CHANCE_12': return '12';
      case 'DNB_HOME': return '1 DNB';
      case 'DNB_AWAY': return '2 DNB';
      case 'OVER_05': return 'Over 0.5';
      case 'UNDER_05': return 'Under 0.5';
      case 'OVER_15': return 'Over 1.5';
      case 'UNDER_15': return 'Under 1.5';
      case 'OVER_25': return 'Over 2.5';
      case 'UNDER_25': return 'Under 2.5';
      case 'OVER_35': return 'Over 3.5';
      case 'UNDER_35': return 'Under 3.5';
      case 'OVER_45': return 'Over 4.5';
      case 'UNDER_45': return 'Under 4.5';
      case 'BTTS_YES': return 'GG';
      case 'BTTS_NO': return 'NG';
      case 'COMBO_1_OVER_15': return '1 & O1.5';
      case 'COMBO_2_OVER_15': return '2 & O1.5';
      case 'COMBO_1_OVER_25': return '1 & O2.5';
      case 'COMBO_2_OVER_25': return '2 & O2.5';
      case 'COMBO_1_OVER_35': return '1 & O3.5';
      case 'COMBO_2_OVER_35': return '2 & O3.5';
      case 'COMBO_1_UNDER_25': return '1 & U2.5';
      case 'COMBO_2_UNDER_25': return '2 & U2.5';
      case 'COMBO_1_UNDER_35': return '1 & U3.5';
      case 'COMBO_2_UNDER_35': return '2 & U3.5';
      case 'COMBO_X_UNDER_25': return 'X & U2.5';
      case 'COMBO_X_OVER_15': return 'X & O1.5';
      case 'COMBO_1_BTTS': return '1 & GG';
      case 'COMBO_2_BTTS': return '2 & GG';
      case 'COMBO_X_BTTS': return 'X & GG';
      case 'COMBO_1X_OVER_15': return '1X & O1.5';
      case 'COMBO_X2_OVER_15': return 'X2 & O1.5';
      case 'COMBO_12_OVER_15': return '12 & O1.5';
      case 'COMBO_1X_OVER_25': return '1X & O2.5';
      case 'COMBO_X2_OVER_25': return 'X2 & O2.5';
      case 'COMBO_12_OVER_25': return '12 & O2.5';
      case 'COMBO_1X_UNDER_25': return '1X & U2.5';
      case 'COMBO_X2_UNDER_25': return 'X2 & U2.5';
      case 'COMBO_1X_UNDER_35': return '1X & U3.5';
      case 'COMBO_X2_UNDER_35': return 'X2 & U3.5';
      case 'COMBO_12_UNDER_35': return '12 & U3.5';
      case 'COMBO_1X_BTTS': return '1X & GG';
      case 'COMBO_X2_BTTS': return 'X2 & GG';
      case 'COMBO_12_BTTS': return '12 & GG';
      case 'COMBO_BTTS_OVER_25': return 'GG & O2.5';
      case 'COMBO_BTTS_OVER_35': return 'GG & O3.5';
      case 'COMBO_BTTS_UNDER_35': return 'GG & U3.5';
      case 'COMBO_BTTS_NO_UNDER_25': return 'NG & U2.5';
      case 'HOME_OVER_05': return 'H O0.5';
      case 'HOME_UNDER_05': return 'H U0.5';
      case 'HOME_OVER_15': return 'H O1.5';
      case 'HOME_UNDER_15': return 'H U1.5';
      case 'HOME_OVER_25': return 'H O2.5';
      case 'HOME_UNDER_25': return 'H U2.5';
      case 'AWAY_OVER_05': return 'A O0.5';
      case 'AWAY_UNDER_05': return 'A U0.5';
      case 'AWAY_OVER_15': return 'A O1.5';
      case 'AWAY_UNDER_15': return 'A U1.5';
      case 'AWAY_OVER_25': return 'A O2.5';
      case 'AWAY_UNDER_25': return 'A U2.5';
      case 'HOME_CLEAN_SHEET': return 'H CS';
      case 'AWAY_CLEAN_SHEET': return 'A CS';
      case 'HOME_WIN_TO_NIL': return '1 & NG';
      case 'AWAY_WIN_TO_NIL': return '2 & NG';
      case 'HANDICAP_HOME_MINUS_1': return 'H (-1.5)';
      case 'HANDICAP_AWAY_MINUS_1': return 'A (-1.5)';
      case 'MULTIGOALS_1_3': return 'MG 1-3';
      case 'MULTIGOALS_2_4': return 'MG 2-4';
      case 'MULTIGOALS_2_5': return 'MG 2-5';
      case 'GOALS_ODD': return 'Odd';
      case 'GOALS_EVEN': return 'Even';
      default: {
        const csMatch = /^CORRECT_SCORE_(\d+)_(\d+)$/.exec(key);
        if (csMatch) return `CS ${csMatch[1]}-${csMatch[2]}`;
        break;
      }
    }

    const raw = (marketName || '').trim();
    const low = raw.toLowerCase();
    if (low === 'home win' || low === '1 (home win)' || low === 'home' || low === '1') return '1';
    if (low === 'away win' || low === '2 (away win)' || low === 'away' || low === '2') return '2';
    if (low === 'draw' || low === 'x (draw)' || low === 'x') return 'X';
    if (low.includes('(1x)') || low.startsWith('1x ') || low.includes('home or draw') || low.includes('home/draw')) return '1X';
    if (low.includes('(x2)') || low.startsWith('x2 ') || low.includes('draw or away') || low.includes('draw/away')) return 'X2';
    if (low.includes('(12)') || low.startsWith('12 ') || low.includes('home or away') || low.includes('home/away')) return '12';
    if (low === 'gg' || low.includes('btts yes') || low.includes('both teams to score (yes)') || low === 'both teams to score') return 'GG';
    if (low === 'ng' || low.includes('btts no') || low.includes('both teams to score (no)')) return 'NG';
    const ouMatch = raw.match(/(Over|Under)\s+(\d+(?:\.\d+)?)/i);
    if (ouMatch) {
      const side = ouMatch[1].charAt(0).toUpperCase() + ouMatch[1].slice(1).toLowerCase();
      return `${side} ${ouMatch[2]}`;
    }
    return raw.replace(/\s*Goals$/i, '').trim() || 'Pick';
  };

  const handleDownloadPoster = async () => {
    if (!posterRef.current || isGeneratingPoster) return;
    setIsGeneratingPoster(true);
    try {
      if (typeof document !== 'undefined' && 'fonts' in document && document.fonts?.ready) {
        await document.fonts.ready;
      }
      await new Promise((r) => setTimeout(r, 120));
      const exportHeight = Math.max(1372, posterRef.current.scrollHeight || 1372);
      const exportOpts = {
        cacheBust: true,
        quality: 1.0,
        pixelRatio: 1,
        width: 747,
        height: exportHeight,
      };
      let dataUrl: string;
      try {
        dataUrl = await toPng(posterRef.current, exportOpts);
      } catch {
        dataUrl = await toPng(posterRef.current, { ...exportOpts, skipFonts: true });
      }
      const link = document.createElement('a');
      link.download = `todays-top-${selections.length}-predictions-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      showToast('Bet slip poster (747×1372) downloaded!', 'success');
    } catch (err: any) {
      console.error('Failed to generate poster:', err);
      showToast('Failed to generate poster image', 'info');
    } finally {
      setIsGeneratingPoster(false);
    }
  };

  const rowCount = selections.length;
  const rowHeightPx =
    rowCount <= 4
      ? 112
      : rowCount <= 6
      ? 104
      : rowCount <= 8
      ? 96
      : rowCount === 9
      ? 92
      : 88;
  const rowGapPx = rowCount <= 6 ? 10 : 7;
  const isCompactSlip = rowCount <= 7;

  return (
    <>
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

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-2">
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
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  onClick={() => void handleDownloadPoster()}
                  disabled={isGeneratingPoster || selections.length === 0}
                  className="bg-gradient-to-r from-cyan-500/15 via-emerald-500/15 to-sky-500/15 border-cyan-500/35 hover:border-cyan-400/70 font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />
                  <span>{isGeneratingPoster ? 'Generating Poster...' : 'Download Social Poster'}</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Hidden 747x1372 Stadium Floodlight Social Poster Template for PNG export */}
      <div className="fixed -left-[9999px] top-0 pointer-events-none select-none" aria-hidden="true">
        <div
          ref={posterRef}
          style={{
            width: '747px',
            minHeight: '1372px',
            boxSizing: 'border-box',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background:
              'linear-gradient(180deg, #040d18 0%, #081c30 28%, #0b2d42 48%, #102e24 62%, #1d431b 74%, #0f2511 88%, #040b06 100%)',
            fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif",
            color: '#ffffff',
          }}
        >
          {/* Stadium Night Sky, Floodlight Beams, Crowd Horizon & Pitch Markings SVG */}
          <svg
            viewBox="0 0 747 1372"
            width="747"
            height="1372"
            preserveAspectRatio="xMidYMid slice"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          >
            <defs>
              <radialGradient id="poster-sky-glow" cx="50%" cy="22%" r="55%">
                <stop offset="0%" stopColor="#1e6b8a" stopOpacity="0.45" />
                <stop offset="55%" stopColor="#0a2840" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#040d18" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="poster-flood-left" cx="4%" cy="38%" r="36%">
                <stop offset="0%" stopColor="#e0faff" stopOpacity="0.95" />
                <stop offset="18%" stopColor="#5efce8" stopOpacity="0.55" />
                <stop offset="55%" stopColor="#0ea5e9" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="poster-flood-right" cx="96%" cy="38%" r="36%">
                <stop offset="0%" stopColor="#e0faff" stopOpacity="0.95" />
                <stop offset="18%" stopColor="#5efce8" stopOpacity="0.55" />
                <stop offset="55%" stopColor="#0ea5e9" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="poster-beam-l" x1="0%" y1="36%" x2="65%" y2="55%">
                <stop offset="0%" stopColor="#67f8e4" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#67f8e4" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="poster-beam-r" x1="100%" y1="36%" x2="35%" y2="55%">
                <stop offset="0%" stopColor="#67f8e4" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#67f8e4" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="poster-turf-wash" x1="0%" y1="54%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#091a24" stopOpacity="0.88" />
                <stop offset="28%" stopColor="#2b5f24" stopOpacity="0.62" />
                <stop offset="68%" stopColor="#143214" stopOpacity="0.82" />
                <stop offset="100%" stopColor="#030804" stopOpacity="0.98" />
              </linearGradient>
              <radialGradient id="poster-center-turf" cx="50%" cy="68%" r="48%">
                <stop offset="0%" stopColor="#4c8c38" stopOpacity="0.48" />
                <stop offset="60%" stopColor="#1e4419" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#050d07" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Atmospheric Sky Glow */}
            <rect x="0" y="0" width="747" height="750" fill="url(#poster-sky-glow)" />

            {/* Subtle Night Stars / Bokeh */}
            <circle cx="92" cy="78" r="1.4" fill="#a5f3fc" opacity="0.55" />
            <circle cx="195" cy="42" r="1.1" fill="#ffffff" opacity="0.45" />
            <circle cx="628" cy="64" r="1.6" fill="#a5f3fc" opacity="0.6" />
            <circle cx="690" cy="145" r="1.2" fill="#ffffff" opacity="0.4" />
            <circle cx="48" cy="195" r="1.3" fill="#67e8f9" opacity="0.5" />
            <circle cx="712" cy="240" r="1.5" fill="#a5f3fc" opacity="0.55" />

            {/* Stadium Tier & Advertising Board Silhouette */}
            <path d="M0 540 L747 540 L747 740 L0 740 Z" fill="#06131c" opacity="0.82" />
            <rect x="0" y="728" width="747" height="24" fill="#0a1622" opacity="0.92" />
            <rect x="0" y="728" width="747" height="3" fill="#22d3ee" opacity="0.35" />

            {/* Crowd Bokeh Lights */}
            <g opacity="0.35">
              <circle cx="24" cy="648" r="3" fill="#e2e8f0" />
              <circle cx="42" cy="662" r="2.5" fill="#fb7185" />
              <circle cx="58" cy="638" r="3.2" fill="#38bdf8" />
              <circle cx="18" cy="692" r="2.8" fill="#facc15" />
              <circle cx="688" cy="650" r="3" fill="#e2e8f0" />
              <circle cx="708" cy="666" r="2.6" fill="#38bdf8" />
              <circle cx="725" cy="642" r="3.2" fill="#fb7185" />
              <circle cx="696" cy="692" r="2.5" fill="#5efce8" />
            </g>

            {/* Turf & Center Pitch Lighting */}
            <rect x="0" y="746" width="747" height="626" fill="url(#poster-turf-wash)" />
            <rect x="0" y="746" width="747" height="626" fill="url(#poster-center-turf)" />

            {/* Subtle Perspective Pitch Lines */}
            <g stroke="#d9f99d" strokeOpacity="0.22" strokeWidth="2" fill="none">
              <line x1="0" y1="785" x2="747" y2="785" />
              <line x1="0" y1="845" x2="747" y2="845" strokeOpacity="0.11" />
              <line x1="0" y1="920" x2="747" y2="920" strokeOpacity="0.09" />
              <line x1="373.5" y1="746" x2="373.5" y2="1372" strokeOpacity="0.14" />
              <ellipse cx="373.5" cy="905" rx="185" ry="52" strokeOpacity="0.14" />
            </g>

            {/* Left & Right Stadium Floodlight Beams */}
            <polygon points="0,420 500,660 440,760 0,565" fill="url(#poster-beam-l)" />
            <polygon points="747,420 247,660 307,760 747,565" fill="url(#poster-beam-r)" />
            <rect x="0" y="250" width="380" height="520" fill="url(#poster-flood-left)" />
            <rect x="367" y="250" width="380" height="520" fill="url(#poster-flood-right)" />

            {/* Vertical Cyan Laser Edge Lines flanking Card */}
            <line x1="38" y1="340" x2="38" y2="1140" stroke="#67f8e4" strokeWidth="1.5" strokeOpacity="0.45" />
            <line x1="709" y1="340" x2="709" y2="1140" stroke="#67f8e4" strokeWidth="1.5" strokeOpacity="0.45" />
          </svg>

          {/* Top-Left Transparent Leopard-in-Ball Crest Emblem */}
          <div
            style={{
              position: 'absolute',
              top: '22px',
              left: '24px',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            <AppLogo size={60} mode="dark" />
          </div>

          {/* Hero Title Block (Athletic Condensed Typography, cleared 96px left/right) */}
          <div
            style={{
              position: 'relative',
              zIndex: 10,
              boxSizing: 'border-box',
              paddingTop: '42px',
              paddingBottom: '18px',
              paddingLeft: '96px',
              paddingRight: '96px',
              textAlign: 'center',
              fontFamily: "'Barlow Condensed', 'Oswald', 'Arial Narrow', sans-serif",
            }}
          >
            <div
              style={{
                fontSize: selections.length >= 100 ? '54px' : '62px',
                fontWeight: 900,
                fontStyle: 'italic',
                lineHeight: 0.92,
                letterSpacing: '0.015em',
                textTransform: 'uppercase',
                textShadow: '0 6px 18px rgba(0, 0, 0, 0.9)',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ color: '#f8fafc' }}>TODAY&apos;S </span>
              <span
                style={{
                  color: '#67f8e4',
                  textShadow: '0 0 24px rgba(94, 252, 232, 0.48), 0 6px 18px rgba(0, 0, 0, 0.9)',
                }}
              >
                TOP {selections.length}
              </span>
            </div>
            <div
              style={{
                fontSize: '72px',
                fontWeight: 900,
                fontStyle: 'italic',
                lineHeight: 0.9,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                color: '#ffffff',
                marginTop: '4px',
                textShadow: '0 8px 20px rgba(0, 0, 0, 0.92)',
                whiteSpace: 'nowrap',
              }}
            >
              {selections.length === 1 ? 'PREDICTION' : 'PREDICTIONS'}
            </div>
          </div>

          {/* Stadium Stage Wrapper (vertically balances compact slips without giant empty voids) */}
          <div
            style={{
              position: 'relative',
              zIndex: 10,
              width: '652px',
              margin: '0 auto 30px auto',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: isCompactSlip ? 'center' : 'flex-start',
            }}
          >
            <div style={{ position: 'relative', width: '100%' }}>
              <svg
                width="66"
                height="66"
                viewBox="0 0 66 66"
                style={{
                  position: 'absolute',
                  top: '-24px',
                  right: '-6px',
                  opacity: 0.28,
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              >
                <circle cx="33" cy="33" r="30" fill="#0e3a52" stroke="#67f8e4" strokeWidth="2" />
                <polygon points="33,18 45,27 40,41 26,41 21,27" fill="#071e2c" stroke="#67f8e4" strokeWidth="1.5" />
              </svg>

              {/* Main Cyan-Bordered Glassmorphic Table Frame */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 5,
                  boxSizing: 'border-box',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: '22px',
                  border: '2px solid rgba(103, 248, 228, 0.78)',
                  background:
                    'linear-gradient(180deg, rgba(9, 32, 48, 0.88) 0%, rgba(6, 20, 34, 0.93) 55%, rgba(4, 13, 24, 0.97) 100%)',
                  boxShadow:
                    '0 0 32px rgba(45, 212, 191, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.14), inset 0 0 24px rgba(45, 212, 191, 0.1), 0 24px 52px rgba(0, 0, 0, 0.78)',
                  padding: '0',
                  overflow: 'hidden',
                }}
              >
                {/* Crisp Table Column Header Strip */}
                <div
                  style={{
                    height: '36px',
                    boxSizing: 'border-box',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) 1px 142px 1px 128px',
                    alignItems: 'center',
                    padding: '0 14px 0 22px',
                    background: 'linear-gradient(90deg, rgba(16, 56, 78, 0.72) 0%, rgba(10, 36, 54, 0.78) 100%)',
                    borderBottom: '1px solid rgba(103, 248, 228, 0.24)',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#7dd3fc',
                  }}
                >
                  <span style={{ paddingLeft: '36px' }}>FIXTURE &amp; COMPETITION</span>
                  <span style={{ width: '1px', height: '14px', background: 'rgba(103, 248, 228, 0.2)' }} />
                  <span style={{ textAlign: 'center' }}>PICK</span>
                  <span style={{ width: '1px', height: '14px', background: 'rgba(103, 248, 228, 0.2)' }} />
                  <span style={{ textAlign: 'center' }}>ODDS</span>
                </div>

                {/* Match Prediction Rows */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: `${rowGapPx}px`,
                    padding: '10px 10px 0 10px',
                  }}
                >
                  {selections.map((sel, idx) => {
                    const shortPick = formatShortPick(sel.marketKey, sel.marketName);
                    const pickFontSize =
                      shortPick.length <= 4
                        ? '28px'
                        : shortPick.length <= 8
                        ? '22px'
                        : shortPick.length <= 12
                        ? '17px'
                        : '14px';
                    const oddsFontSize = sel.odds >= 100 ? '21px' : '25px';
                    const subtitleText = [sel.leagueName, sel.kickOffTime].filter(Boolean).join(' · ') || sel.marketName;

                    return (
                      <div
                        key={sel.fixtureId || idx}
                        style={{
                          position: 'relative',
                          boxSizing: 'border-box',
                          height: `${rowHeightPx}px`,
                          borderRadius: '14px',
                          border: '1px solid rgba(103, 248, 228, 0.36)',
                          background:
                            'linear-gradient(180deg, rgba(20, 56, 78, 0.9) 0%, rgba(9, 29, 44, 0.96) 58%, rgba(6, 19, 31, 0.98) 100%)',
                          boxShadow:
                            'inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 4px 12px rgba(0, 0, 0, 0.34)',
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr) 1px 142px 1px 128px',
                          alignItems: 'center',
                          padding: '0 4px 0 12px',
                          overflow: 'hidden',
                        }}
                      >
                        {/* Column 1: Index Number + Fixture Title + Competition Sub-line */}
                        <div
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            paddingRight: '12px',
                          }}
                        >
                          <span
                            style={{
                              width: '26px',
                              flexShrink: 0,
                              textAlign: 'center',
                              fontFamily: "'Barlow Condensed', 'Oswald', sans-serif",
                              fontSize: idx + 1 >= 10 ? '23px' : '25px',
                              fontWeight: 900,
                              fontStyle: 'italic',
                              lineHeight: 1,
                              color: '#67f8e4',
                              textShadow: '0 0 12px rgba(94, 252, 232, 0.55)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {idx + 1}
                          </span>
                          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                            <div
                              style={{
                                fontFamily: "'Barlow Condensed', 'Oswald', sans-serif",
                                fontSize: '25px',
                                fontWeight: 700,
                                lineHeight: '27px',
                                color: '#ffffff',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                letterSpacing: '0.01em',
                                textShadow: '0 2px 6px rgba(0, 0, 0, 0.7)',
                              }}
                            >
                              {sel.homeTeam} vs {sel.awayTeam}
                            </div>
                            <div
                              style={{
                                marginTop: '3px',
                                fontSize: '11.5px',
                                fontWeight: 600,
                                lineHeight: '15px',
                                letterSpacing: '0.02em',
                                color: '#94c5d8',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {subtitleText}
                            </div>
                          </div>
                        </div>

                        {/* Column 2: Vertical Hairline Divider 1 */}
                        <div
                          style={{
                            width: '1px',
                            height: `${Math.max(44, rowHeightPx - 34)}px`,
                            background:
                              'linear-gradient(180deg, rgba(103,248,228,0) 0%, rgba(103,248,228,0.34) 50%, rgba(103,248,228,0) 100%)',
                          }}
                        />

                        {/* Column 3: Middle PICK Column */}
                        <div
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 8px',
                            textAlign: 'center',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 800,
                              letterSpacing: '0.1em',
                              color: '#7dd3fc',
                              textTransform: 'uppercase',
                              lineHeight: 1.1,
                            }}
                          >
                            PICK
                          </span>
                          <span
                            style={{
                              maxWidth: '100%',
                              fontFamily: "'Barlow Condensed', 'Oswald', sans-serif",
                              fontSize: pickFontSize,
                              fontWeight: 800,
                              color: '#ffffff',
                              lineHeight: 1.05,
                              marginTop: '3px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              textShadow: '0 2px 6px rgba(0, 0, 0, 0.72)',
                            }}
                          >
                            {shortPick}
                          </span>
                        </div>

                        {/* Column 4: Vertical Hairline Divider 2 */}
                        <div
                          style={{
                            width: '1px',
                            height: `${Math.max(44, rowHeightPx - 34)}px`,
                            background:
                              'linear-gradient(180deg, rgba(103,248,228,0) 0%, rgba(103,248,228,0.34) 50%, rgba(103,248,228,0) 100%)',
                          }}
                        />

                        {/* Column 5: Right ODDS Column */}
                        <div
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 8px',
                            textAlign: 'center',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 800,
                              letterSpacing: '0.1em',
                              color: '#7dd3fc',
                              textTransform: 'uppercase',
                              lineHeight: 1.1,
                            }}
                          >
                            ODDS
                          </span>
                          <span
                            style={{
                              fontFamily: "'Barlow Condensed', 'Oswald', sans-serif",
                              fontSize: oddsFontSize,
                              fontWeight: 800,
                              color: '#67f8e4',
                              lineHeight: 1.05,
                              marginTop: '3px',
                              fontVariantNumeric: 'tabular-nums',
                              textShadow: '0 0 12px rgba(103, 248, 228, 0.35), 0 2px 6px rgba(0, 0, 0, 0.7)',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {sel.odds.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Curved Speed Ribbon + Summary Strip + Soccer Ball */}
                <div
                  style={{
                    position: 'relative',
                    boxSizing: 'border-box',
                    height: '88px',
                    marginTop: '12px',
                    borderTop: '1px solid rgba(103, 248, 228, 0.25)',
                    background:
                      'linear-gradient(90deg, rgba(5, 18, 30, 0.94) 0%, rgba(8, 32, 46, 0.94) 72%, rgba(11, 44, 52, 0.96) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0 122px 0 24px',
                    overflow: 'hidden',
                  }}
                >
                  {/* Flowing Cyan Ribbon Graphics */}
                  <svg
                    viewBox="0 0 652 88"
                    width="652"
                    height="88"
                    preserveAspectRatio="none"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      pointerEvents: 'none',
                    }}
                  >
                    <path
                      d="M0 88 C85 38, 165 22, 250 88 Z"
                      fill="#0d2a3d"
                      opacity="0.82"
                    />
                    <path
                      d="M365 88 C465 60, 545 28, 652 4 L652 88 Z"
                      fill="#114e63"
                      opacity="0.72"
                    />
                    <path
                      d="M420 88 C500 62, 570 36, 652 14 L652 28 C580 48, 517 70, 465 88 Z"
                      fill="#2dd4bf"
                      opacity="0.38"
                    />
                    <path
                      d="M0 64 C65 28, 130 26, 195 88"
                      stroke="#67f8e4"
                      strokeWidth="1.5"
                      strokeOpacity="0.28"
                      fill="none"
                    />
                  </svg>

                  {/* Accumulator Summary Metrics (clipped cleanly before soccer ball) */}
                  <div
                    style={{
                      position: 'relative',
                      zIndex: 5,
                      minWidth: 0,
                      flex: 1,
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '20px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <div style={{ minWidth: 0, flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#94a3b8',
                          fontWeight: 800,
                          letterSpacing: '0.1em',
                          display: 'block',
                        }}
                      >
                        TOTAL ODDS
                      </span>
                      <span
                        style={{
                          fontFamily: "'Barlow Condensed', 'Oswald', sans-serif",
                          fontSize: '26px',
                          fontWeight: 900,
                          color: '#67f8e4',
                          lineHeight: 1.05,
                          whiteSpace: 'nowrap',
                          display: 'block',
                          marginTop: '2px',
                        }}
                      >
                        {totalOdds.toFixed(2)}x
                      </span>
                    </div>
                    <div style={{ width: '1px', height: '34px', flexShrink: 0, background: 'rgba(103, 248, 228, 0.22)' }} />
                    <div style={{ minWidth: 0, flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#94a3b8',
                          fontWeight: 800,
                          letterSpacing: '0.1em',
                          display: 'block',
                        }}
                      >
                        STAKE
                      </span>
                      <span
                        style={{
                          fontFamily: "'Barlow Condensed', 'Oswald', sans-serif",
                          fontSize: '24px',
                          fontWeight: 800,
                          color: '#ffffff',
                          lineHeight: 1.05,
                          whiteSpace: 'nowrap',
                          display: 'block',
                          marginTop: '2px',
                        }}
                      >
                        {numericStake.toFixed(0)} Br
                      </span>
                    </div>
                    <div style={{ width: '1px', height: '34px', flexShrink: 0, background: 'rgba(103, 248, 228, 0.22)' }} />
                    <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#94a3b8',
                          fontWeight: 800,
                          letterSpacing: '0.1em',
                          display: 'block',
                        }}
                      >
                        POTENTIAL PAYOUT
                      </span>
                      <span
                        style={{
                          fontFamily: "'Barlow Condensed', 'Oswald', sans-serif",
                          fontSize: '26px',
                          fontWeight: 900,
                          color: '#34d399',
                          lineHeight: 1.05,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: 'block',
                          marginTop: '2px',
                        }}
                      >
                        {potentialWin.toFixed(2)} Br
                      </span>
                    </div>
                  </div>

                  {/* Classic 3D Soccer Ball at Bottom-Right */}
                  <svg
                    width="84"
                    height="84"
                    viewBox="0 0 100 100"
                    style={{
                      position: 'absolute',
                      right: '18px',
                      bottom: '-12px',
                      zIndex: 6,
                      pointerEvents: 'none',
                      filter: 'drop-shadow(0 -2px 10px rgba(0,0,0,0.7))',
                    }}
                  >
                    <defs>
                      <radialGradient id="soccer-sphere" cx="38%" cy="32%" r="65%">
                        <stop offset="0%" stopColor="#ffffff" />
                        <stop offset="65%" stopColor="#cbd5e1" />
                        <stop offset="100%" stopColor="#475569" />
                      </radialGradient>
                    </defs>
                    <circle cx="50" cy="50" r="46" fill="url(#soccer-sphere)" stroke="#1e293b" strokeWidth="2" />
                    <polygon points="50,31 66,43 60,61 40,61 34,43" fill="#0f172a" />
                    <polygon points="50,5 62,13 58,25 42,25 38,13" fill="#0f172a" />
                    <polygon points="10,36 22,30 28,43 20,56 8,51" fill="#0f172a" />
                    <polygon points="90,36 78,30 72,43 80,56 92,51" fill="#0f172a" />
                    <polygon points="24,78 36,70 46,82 36,93 22,88" fill="#0f172a" />
                    <polygon points="76,78 64,70 54,82 64,93 78,88" fill="#0f172a" />
                    <g stroke="#334155" strokeWidth="2" fill="none">
                      <line x1="50" y1="31" x2="50" y2="25" />
                      <line x1="34" y1="43" x2="28" y2="43" />
                      <line x1="66" y1="43" x2="72" y2="43" />
                      <line x1="40" y1="61" x2="36" y2="70" />
                      <line x1="60" y1="61" x2="64" y2="70" />
                    </g>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
