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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-xs">
            <Newspaper className="w-3 h-3" />
            Headline
          </span>
        );
      case 'MATCH_PREVIEW':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-50 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 shadow-xs">
            <Activity className="w-3 h-3" />
            Preview
          </span>
        );
      case 'BETTING_TIP':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 shadow-xs">
            <TrendingUp className="w-3 h-3" />
            Tip
          </span>
        );
      case 'INJURY_TEAM_NEWS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 shadow-xs">
            <AlertCircle className="w-3 h-3" />
            Team News
          </span>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-[#0B0F17] rounded-3xl p-5 shadow-xs border border-slate-100 dark:border-slate-800/80 space-y-4 font-sans">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
            Trends
          </h2>
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing || isLoading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 shadow-xs transition-all disabled:opacity-50 cursor-pointer shrink-0"
          title="Refresh trends"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl flex items-center gap-1 overflow-x-auto no-scrollbar shadow-inner shrink-0 flex-nowrap">
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
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory === tab.id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[160px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search trends..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-slate-400 font-medium shadow-xs"
          />
        </div>
      </div>

      {/* Content Rendering */}
      {isLoading ? (
        <div className="p-12 text-center rounded-2xl space-y-3">
          <RefreshCw className="w-8 h-8 text-slate-400 animate-spin mx-auto" />
          <p className="text-xs text-slate-500 font-bold">Loading Trends...</p>
        </div>
      ) : filteredTips.length === 0 ? (
        <div className="p-12 text-center rounded-2xl space-y-2">
          <Layers className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto" />
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No items found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredTips.map((tip) => (
            <div
              key={tip.id}
              className="bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-4 shadow-xs flex flex-col justify-between space-y-3 hover:bg-slate-100/70 dark:hover:bg-slate-900/90 transition-all border border-slate-100 dark:border-slate-800"
            >
              <div className="space-y-2">
                {/* Badge Row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getCategoryBadge(tip.category)}
                    {tip.league && (
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800">
                        {tip.league}
                      </span>
                    )}
                  </div>
                  {tip.confidenceOrOdds && (
                    <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/40">
                      {tip.confidenceOrOdds}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                  {tip.title}
                </h4>

                {/* Recommended Pick */}
                {tip.predictionOrTip && (
                  <div className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase font-black text-slate-400">Pick</span>
                    <span className="truncate">{tip.predictionOrTip}</span>
                  </div>
                )}

                {/* Brief Analysis */}
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {tip.analysis}
                </p>
              </div>

              {/* Source Link */}
              <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-100 dark:border-slate-800">
                {tip.sourceUrl ? (
                  <a
                    href={tip.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold transition-colors truncate max-w-[200px]"
                  >
                    <span className="truncate">{tip.sourceTitle || 'Source'}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-[10px] text-slate-400 font-mono font-medium">Live Search</span>
                )}
                {tip.match && (
                  <span className="text-[10px] text-slate-500 dark:text-slate-500 font-bold truncate max-w-[140px]">
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
