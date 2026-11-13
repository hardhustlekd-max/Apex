import React from 'react';
import { LiveScore } from '../providers/types.js';
import { Badge } from './ui/index.js';

interface LiveScoresTickerProps {
  liveScores: LiveScore[];
  providerName?: string;
}

export const LiveScoresTicker: React.FC<LiveScoresTickerProps> = ({ liveScores }) => {
  if (!liveScores || liveScores.length === 0) return null;

  return (
    <div className="bg-theme-card/95 backdrop-blur-md px-3 sm:px-4 lg:px-6 py-2 transition-colors font-sans shadow-theme-sm">
      <div className="max-w-6xl mx-auto flex items-center gap-2.5 overflow-x-auto no-scrollbar text-xs flex-nowrap">
        {/* In-Play Signal */}
        <Badge variant="danger" pill size="xs" className="px-3 py-1 font-black">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          <span>IN-PLAY</span>
        </Badge>

        {/* Live Scores Items */}
        <div className="flex items-center gap-2 flex-nowrap">
          {liveScores.map((s) => (
            <div
              key={s.fixtureId}
              className="flex items-center gap-2 bg-theme-subtle rounded-full px-3 py-1 shrink-0 transition-all hover:bg-theme-card-elevated whitespace-nowrap text-xs"
            >
              <span className="font-mono tabular-nums text-rose-500 dark:text-rose-400 font-extrabold text-[10.5px] shrink-0">
                {s.status === 'FINISHED' ? 'FT' : `${s.minute}'`}
              </span>
              <span className="font-bold text-theme-main whitespace-nowrap text-xs">{s.homeTeam}</span>
              <Badge variant="solid" pill size="xs">
                {s.homeScore} - {s.awayScore}
              </Badge>
              <span className="font-bold text-theme-main whitespace-nowrap text-xs">{s.awayTeam}</span>
              {s.events && s.events.length > 0 && (
                <span className="text-[10px] font-mono tabular-nums text-theme-sub font-medium ml-1 truncate max-w-[140px] whitespace-nowrap shrink-0">
                  {s.events[s.events.length - 1].player} ({s.events[s.events.length - 1].minute}&apos;)
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
