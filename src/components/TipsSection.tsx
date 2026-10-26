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
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-xs uppercase tracking-wide">
            <Newspaper className="w-3.5 h-3.5" />
            Headline
          </span>
        );
      case 'MATCH_PREVIEW':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-slate-50 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 shadow-xs uppercase tracking-wide">
            <Activity className="w-3.5 h-3.5" />
            Preview
          </span>
        );
      case 'BETTING_TIP':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-slate-100 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 shadow-xs uppercase tracking-wide">
            <TrendingUp className="w-3.5 h-3.5" />
            Tip
          </span>
        );
      case 'INJURY_TEAM_NEWS':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 shadow-xs uppercase tracking-wide">
            <AlertCircle className="w-3.5 h-3.5" />
            Team News
          </span>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-[#121212] rounded-2xl p-3.5 sm:p-5 shadow-xs border border-slate-200 dark:border-white/10 space-y-3 font-sans text-slate-900 dark:text-slate-100">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-white/10">
        <div>
          <h2 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
            Trends
          </h2>
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isRefreshing || isLoading}
          className="flex items-center gap-1.5 px-4 py-2 h-10 rounded-full text-xs font-black bg-slate-900 hover:bg-slate-800 dark:bg-[#CCFF00] dark:hover:bg-[#b5ff00] text-white dark:text-slate-950 shadow-xs transition-all disabled:opacity-50 cursor-pointer shrink-0 active:scale-95"
          title="Refresh trends"
        >
          <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        {/* Category Pills */}
        <div className="bg-slate-100 dark:bg-[#1E1E1E] p-1 rounded-full flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0 flex-nowrap border border-transparent dark:border-white/10">
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
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory === tab.id
                  ? 'bg-slate-900 text-white dark:bg-[#CCFF00] dark:text-slate-950 font-black shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[150px]">
          <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 shrink-0" />
          <input
            type="text"
            placeholder="Search trends..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 bg-slate-100 dark:bg-[#1E1E1E] border border-transparent dark:border-white/10 rounded-full pl-9 pr-3.5 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:outline-none font-semibold shadow-xs"
          />
        </div>
      </div>

      {/* Content Rendering */}
      {isLoading ? (
        <div className="p-10 text-center rounded-xl space-y-2">
          <RefreshCw className="w-6 h-6 text-slate-400 dark:text-[#CCFF00] animate-spin mx-auto" />
          <p className="text-[11px] text-slate-500 font-bold">Loading Trends...</p>
        </div>
      ) : filteredTips.length === 0 ? (
        <div className="p-10 text-center rounded-xl space-y-1.5">
          <Layers className="w-6 h-6 text-slate-300 dark:text-slate-700 mx-auto" />
          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">No items found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {filteredTips.map((tip) => (
            <div
              key={tip.id}
              className="bg-slate-50 dark:bg-[#1E1E1E] rounded-xl p-3 shadow-xs flex flex-col justify-between space-y-2.5 hover:bg-slate-100 dark:hover:bg-[#252525] transition-all border border-slate-200 dark:border-white/10"
            >
              <div className="space-y-1.5">
                {/* Badge Row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {getCategoryBadge(tip.category)}
                    {tip.league && (
                      <span className="text-[8.5px] font-mono font-bold text-slate-500 dark:text-slate-300 px-2 py-0.5 rounded-full bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10">
                        {tip.league}
                      </span>
                    )}
                  </div>
                  {tip.confidenceOrOdds && (
                    <span className="text-[8.5px] font-mono font-black text-amber-700 dark:text-[#CCFF00] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-[#CCFF00]/10 border border-amber-200 dark:border-[#CCFF00]/30">
                      {tip.confidenceOrOdds}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                  {tip.title}
                </h4>

                {/* Recommended Pick */}
                {tip.predictionOrTip && (
                  <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#121212] text-[10.5px] font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 flex items-center justify-between gap-2 font-mono">
                    <span className="text-[8.5px] uppercase font-black text-slate-400">Pick</span>
                    <span className="truncate text-[#CCFF00] font-black">{tip.predictionOrTip}</span>
                  </div>
                )}

                {/* Brief Analysis */}
                <p className="text-[10.5px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {tip.analysis}
                </p>
              </div>

              {/* Source Link */}
              <div className="pt-1.5 flex items-center justify-between text-[10.5px] border-t border-slate-100 dark:border-white/10">
                {tip.sourceUrl ? (
                  <a
                    href={tip.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-[#CCFF00] font-semibold transition-colors truncate max-w-[180px]"
                  >
                    <span className="truncate">{tip.sourceTitle || 'Source'}</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </a>
                ) : (
                  <span className="text-[8.5px] text-slate-400 font-mono font-medium">Live Search</span>
                )}
                {tip.match && (
                  <span className="text-[8.5px] text-slate-500 dark:text-slate-400 font-bold truncate max-w-[120px] font-mono">
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
