import React from 'react';
import { LiveScore } from '../providers/types.js';

interface LiveScoresTickerProps {
  liveScores: LiveScore[];
  providerName?: string;
}

export const LiveScoresTicker: React.FC<LiveScoresTickerProps> = ({ liveScores }) => {
  if (!liveScores || liveScores.length === 0) return null;

  return (
    <div className="bg-white/90 dark:bg-[#121212]/95 backdrop-blur-md px-3 sm:px-4 lg:px-6 py-2 transition-colors font-sans border-b border-slate-200 dark:border-white/10">
      <div className="max-w-6xl mx-auto flex items-center gap-2.5 overflow-x-auto no-scrollbar text-xs flex-nowrap">
        {/* In-Play Badge */}
        <div className="flex items-center gap-1.5 shrink-0 font-black text-[10px] text-rose-500 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/20 px-3 py-1 rounded-full whitespace-nowrap font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          <span>IN-PLAY</span>
        </div>

        {/* Live Scores Items */}
        <div className="flex items-center gap-2 flex-nowrap">
          {liveScores.map((s) => (
            <div
              key={s.fixtureId}
              className="flex items-center gap-2 bg-slate-100 dark:bg-[#1E1E1E] border border-slate-200 dark:border-white/10 rounded-full px-3 py-1 shrink-0 transition-all hover:bg-slate-200 dark:hover:bg-white/10 whitespace-nowrap text-xs shadow-2xs"
            >
              <span className="font-mono text-rose-500 dark:text-rose-400 font-extrabold text-[10.5px] shrink-0">
                {s.status === 'FINISHED' ? 'FT' : `${s.minute}'`}
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap text-xs">{s.homeTeam}</span>
              <span className="font-mono font-black bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 text-slate-950 dark:text-[#CCFF00] px-2 py-0.5 rounded-full text-[10.5px] shrink-0 whitespace-nowrap">
                {s.homeScore} - {s.awayScore}
              </span>
              <span className="font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap text-xs">{s.awayTeam}</span>
              {s.events && s.events.length > 0 && (
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-400 font-medium ml-1 truncate max-w-[140px] whitespace-nowrap shrink-0">
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
