import React from 'react';
import { LiveScore } from '../providers/types.js';

interface LiveScoresTickerProps {
  liveScores: LiveScore[];
  providerName?: string;
}

export const LiveScoresTicker: React.FC<LiveScoresTickerProps> = ({ liveScores }) => {
  if (!liveScores || liveScores.length === 0) return null;

  return (
    <div className="bg-white/80 dark:bg-[#070c14]/90 backdrop-blur-md px-3 sm:px-4 lg:px-6 py-2 transition-colors font-sans">
      <div className="max-w-6xl mx-auto flex items-center gap-2.5 overflow-x-auto no-scrollbar text-xs flex-nowrap">
        {/* In-Play Badge */}
        <div className="flex items-center gap-1.5 shrink-0 font-bold text-[10px] text-rose-500 bg-rose-500/10 px-2.5 py-1 rounded-xl whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          <span>IN-PLAY</span>
        </div>

        {/* Live Scores Items */}
        <div className="flex items-center gap-2 flex-nowrap">
          {liveScores.map((s) => (
            <div
              key={s.fixtureId}
              className="flex items-center gap-2 bg-slate-100/80 dark:bg-[#101728] rounded-xl px-2.5 py-1 shrink-0 transition-all hover:bg-slate-200/80 dark:hover:bg-[#162038] whitespace-nowrap text-xs shadow-xs"
            >
              <span className="font-mono text-rose-500 dark:text-rose-400 font-bold text-[10.5px] shrink-0">
                {s.status === 'FINISHED' ? 'FT' : `${s.minute}'`}
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap text-xs">{s.homeTeam}</span>
              <span className="font-mono font-bold bg-white dark:bg-[#162038] text-slate-950 dark:text-white px-1.5 py-0.5 rounded-lg text-[10.5px] shadow-xs shrink-0 whitespace-nowrap">
                {s.homeScore} - {s.awayScore}
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap text-xs">{s.awayTeam}</span>
              {s.events && s.events.length > 0 && (
                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium ml-1 truncate max-w-[140px] whitespace-nowrap shrink-0">
                  {s.events[s.events.length - 1].type === 'GOAL' ? '⚽ ' : ''}
                  {s.events[s.events.length - 1].player} ({s.events[s.events.length - 1].minute}')
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
