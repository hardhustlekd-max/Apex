import React, { useState } from 'react';
import {
  RefreshCw,
  ExternalLink,
  Newspaper,
  Activity,
  TrendingUp,
  AlertCircle,
  Search,
  Layers,
} from 'lucide-react';
import { TrendingTipsData, FootballTipItem } from '../core/types.js';

interface TipsSectionProps {
  tipsData: TrendingTipsData | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const TipsSection: React.FC<TipsSectionProps> = ({
  tipsData,
  isLoading,
  isRefreshing,
  onRefresh,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<
    'ALL' | 'HEADLINE' | 'MATCH_PREVIEW' | 'BETTING_TIP' | 'INJURY_TEAM_NEWS'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTips = (tipsData?.tips || []).filter((item) => {
    if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchText = `${item.title} ${item.analysis} ${item.match || ''} ${item.league || ''} ${item.predictionOrTip || ''}`.toLowerCase();
      return matchText.includes(q);
    }
    return true;
  });

  const getCategoryBadge = (category: FootballTipItem['category']) => {
    switch (category) {
      case 'HEADLINE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-white/10 text-cyan-700 dark:text-cyan-300 uppercase tracking-wide">
            <Newspaper className="w-3.5 h-3.5" />
            Headline
          </span>
        );
      case 'MATCH_PREVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-neutral-200 uppercase tracking-wide">
            <Activity className="w-3.5 h-3.5" />
            Preview
          </span>
        );
      case 'BETTING_TIP':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-theme-primary text-theme-primary-text uppercase tracking-wide">
            <TrendingUp className="w-3.5 h-3.5" />
            Tip
          </span>
        );
      case 'INJURY_TEAM_NEWS':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 uppercase tracking-wide">
            <AlertCircle className="w-3.5 h-3.5" />
            Team News
          </span>
        );
    }
  };

  return (
    <div className="bg-theme-card border border-theme rounded-2xl p-3.5 sm:p-5 shadow-xs space-y-3 font-sans text-theme-main">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2.5 pb-2 border-b border-theme">
        <div>
          <h2 className="text-sm sm:text-base font-black text-theme-main uppercase tracking-wider">
            Trends & Tips
          </h2>
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing || isLoading}
          className="flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-full text-xs font-black bg-theme-primary text-theme-primary-text hover:opacity-90 shadow-xs transition-all disabled:opacity-50 cursor-pointer shrink-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary"
          title="Refresh trends"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Category Pills */}
        <div className="bg-theme-subtle border border-theme p-1 rounded-2xl flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0 flex-nowrap">
          {[
            { id: 'ALL' as const, label: 'All' },
            { id: 'BETTING_TIP' as const, label: 'Tips' },
            { id: 'MATCH_PREVIEW' as const, label: 'Previews' },
            { id: 'HEADLINE' as const, label: 'Headlines' },
            { id: 'INJURY_TEAM_NEWS' as const, label: 'Team News' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedCategory(tab.id)}
              className={`px-3.5 py-1.5 min-h-[36px] rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory === tab.id
                  ? 'bg-theme-primary text-theme-primary-text font-black shadow-xs'
                  : 'text-theme-sub hover:text-theme-main'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[150px]">
          <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-theme-sub shrink-0" />
          <input
            type="text"
            placeholder="Search trends..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 bg-theme-subtle border border-theme rounded-xl pl-9 pr-3.5 py-2 text-xs text-theme-main placeholder:text-theme-sub focus:outline-none focus-visible:ring-2 focus-visible:ring-theme-primary font-semibold shadow-xs"
          />
        </div>
      </div>

      {/* Content Rendering */}
      {isLoading ? (
        <div className="p-10 text-center rounded-2xl space-y-2">
          <RefreshCw className="w-6 h-6 text-theme-primary animate-spin mx-auto" />
          <p className="text-xs text-theme-sub font-bold">Loading Trends...</p>
        </div>
      ) : filteredTips.length === 0 ? (
        <div className="p-10 text-center rounded-2xl space-y-1.5">
          <Layers className="w-6 h-6 text-theme-sub mx-auto" />
          <p className="text-xs font-bold text-theme-sub">No items found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {filteredTips.map((tip) => (
            <div
              key={tip.id}
              className="bg-theme-subtle border border-theme rounded-xl p-3.5 shadow-xs flex flex-col justify-between space-y-2.5 transition-all"
            >
              <div className="space-y-1.5">
                {/* Badge Row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {getCategoryBadge(tip.category)}
                    {tip.league && (
                      <span className="text-[11px] font-mono font-bold text-theme-sub px-2 py-0.5 rounded bg-theme-card border border-theme">
                        {tip.league}
                      </span>
                    )}
                  </div>
                  {tip.confidence && (
                    <span className="text-[11px] font-mono font-black text-theme-primary-text px-2.5 py-0.5 rounded-full bg-theme-primary shadow-xs uppercase tracking-tight">
                      {tip.confidence}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h4 className="text-sm font-bold text-theme-main leading-snug">
                  {tip.title}
                </h4>

                {/* Recommended Pick */}
                {tip.predictionOrTip && (
                  <div className="px-3 py-1.5 rounded-lg bg-theme-card border border-theme text-[11px] font-bold text-theme-main flex items-center justify-between gap-2 font-mono">
                    <span className="text-[10px] uppercase font-black text-theme-sub">Pick</span>
                    <span className="truncate text-theme-primary font-black">{tip.predictionOrTip}</span>
                  </div>
                )}

                {/* Brief Analysis */}
                <p className="text-xs text-theme-sub line-clamp-2 leading-relaxed">
                  {tip.analysis}
                </p>
              </div>

              {/* Source Link */}
              <div className="pt-2 flex items-center justify-between text-xs">
                {tip.sourceUrl ? (
                  <a
                    href={tip.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-theme-primary hover:underline font-bold transition-colors truncate max-w-[180px]"
                  >
                    <span className="truncate">{tip.sourceTitle || 'Source'}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-[10px] text-theme-sub font-medium">Live Search</span>
                )}
                {tip.match && (
                  <span className="text-[11px] text-theme-sub font-bold truncate max-w-[120px]">
                    {tip.match}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
