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
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  SectionHeader,
  SegmentedTabs,
} from './ui/index.js';

type TipCategoryFilter = 'ALL' | 'HEADLINE' | 'MATCH_PREVIEW' | 'BETTING_TIP' | 'INJURY_TEAM_NEWS';

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
  const [selectedCategory, setSelectedCategory] = useState<TipCategoryFilter>('ALL');
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
          <Badge variant="info" size="xs">
            <Newspaper className="w-3 h-3" />
            <span>Headline</span>
          </Badge>
        );
      case 'MATCH_PREVIEW':
        return (
          <Badge variant="default" size="xs">
            <Activity className="w-3 h-3" />
            <span>Preview</span>
          </Badge>
        );
      case 'BETTING_TIP':
        return (
          <Badge variant="solid" size="xs">
            <TrendingUp className="w-3 h-3" />
            <span>Tip</span>
          </Badge>
        );
      case 'INJURY_TEAM_NEWS':
        return (
          <Badge variant="warning" size="xs">
            <AlertCircle className="w-3 h-3" />
            <span>Team News</span>
          </Badge>
        );
    }
  };

  return (
    <Card surface="default" padding="md" radius="2xl" className="sm:p-5 space-y-3 font-sans text-theme-main">
      {/* Header Bar */}
      <SectionHeader
        title="Trends & Tips"
        size="md"
        className="pb-2"
        action={
          <Button
            variant="primary"
            size="md"
            pill
            onClick={onRefresh}
            disabled={isRefreshing || isLoading}
            title="Refresh trends"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </Button>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <SegmentedTabs<TipCategoryFilter>
          items={[
            { id: 'ALL', label: 'All' },
            { id: 'BETTING_TIP', label: 'Tips' },
            { id: 'MATCH_PREVIEW', label: 'Previews' },
            { id: 'HEADLINE', label: 'Headlines' },
            { id: 'INJURY_TEAM_NEWS', label: 'Team News' },
          ]}
          value={selectedCategory}
          onChange={(val) => setSelectedCategory(val)}
          variant="subtle"
          size="md"
          ariaLabel="Trend categories"
        />

        <div className="min-w-[150px] sm:w-56">
          <Input
            type="text"
            placeholder="Search trends..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
            leftIcon={<Search className="w-3.5 h-3.5" />}
            inputSize="md"
            surface="subtle"
          />
        </div>
      </div>

      {/* Content Rendering */}
      {isLoading ? (
        <LoadingState label="Loading Trends..." minHeight="min-h-[200px]" />
      ) : filteredTips.length === 0 ? (
        <EmptyState
          icon={<Layers className="w-6 h-6" />}
          title="No items found"
          minHeight="min-h-[180px]"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {filteredTips.map((tip) => (
            <Card
              key={tip.id}
              surface="subtle"
              padding="md"
              radius="xl"
              className="hover:bg-theme-card-elevated hover:shadow-theme-sm flex flex-col justify-between space-y-2.5"
            >
              <div className="space-y-1.5">
                {/* Badge Row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {getCategoryBadge(tip.category)}
                    {tip.league && (
                      <Badge variant="default" size="xs" className="bg-theme-card truncate">
                        {tip.league}
                      </Badge>
                    )}
                  </div>
                  {tip.confidence && (
                    <Badge variant="solid" size="xs" pill>
                      {tip.confidence}
                    </Badge>
                  )}
                </div>

                {/* Title */}
                <h4 className="text-sm font-bold text-theme-main leading-snug">{tip.title}</h4>

                {/* Recommended Pick */}
                {tip.predictionOrTip && (
                  <div className="px-3 py-1.5 rounded-lg bg-theme-card text-[11px] font-bold text-theme-main flex items-center justify-between gap-2 font-mono">
                    <span className="text-[10px] uppercase font-black text-theme-sub">Pick</span>
                    <span className="truncate text-theme-primary font-black">{tip.predictionOrTip}</span>
                  </div>
                )}

                {/* Brief Analysis */}
                <p className="text-xs text-theme-sub line-clamp-2 leading-relaxed">{tip.analysis}</p>
              </div>

              {/* Source Link */}
              <div className="pt-2 flex items-center justify-between text-xs">
                {tip.sourceUrl ? (
                  <a
                    href={tip.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-theme-primary hover:underline font-bold transition-colors truncate max-w-[180px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent rounded"
                  >
                    <span className="truncate">{tip.sourceTitle || 'Source'}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-[10px] text-theme-sub font-medium">Live Search</span>
                )}
                {tip.match && (
                  <span className="text-[11px] text-theme-sub font-bold truncate max-w-[120px]">{tip.match}</span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Card>
  );
};
