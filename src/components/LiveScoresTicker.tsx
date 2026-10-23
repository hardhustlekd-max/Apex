import React from 'react';
import { LiveScore } from '../providers/types.js';

interface LiveScoresTickerProps {
  liveScores: LiveScore[];
  providerName?: string;
}

export const LiveScoresTicker: React.FC<LiveScoresTickerProps> = ({ liveScores }) => {
  if (!liveScores || liveScores.length === 0) return null;

  return (
    <div className="bg-slate-50/95 dark:bg-slate-900/60 backdrop-blur-md px-4 sm:px-6 py-2 transition-colors border-b border-slate-200 dark:border-slate-800 font-sans">
      <div className="max-w-6xl mx-auto flex items-center gap-3 overflow-x-auto no-scrollbar text-xs flex-nowrap">
        {/* In-Play Badge */}
        <div className="flex items-center gap-1.5 shrink-0 font-bold text-[10px] text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/60 px-2.5 py-1 rounded-xl shadow-xs whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
          <span>IN-PLAY</span>
        </div>

        {/* Live Scores Items */}
        <div className="flex items-center gap-2.5 flex-nowrap">
          {liveScores.map((s) => (
            <div
              key={s.fixtureId}
              className="flex items-center gap-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 shrink-0 transition-all hover:shadow-sm whitespace-nowrap text-xs shadow-xs"
            >
              <span className="font-mono text-slate-500 dark:text-slate-400 font-bold text-[11px] shrink-0">
                {s.status === 'FINISHED' ? 'FT' : `${s.minute}'`}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-200 whitespace-nowrap">{s.homeTeam}</span>
              <span className="font-mono font-bold bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white px-2 py-0.5 rounded-lg text-[11px] shadow-xs shrink-0 whitespace-nowrap">
                {s.homeScore} - {s.awayScore}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-200 whitespace-nowrap">{s.awayTeam}</span>
              {s.events && s.events.length > 0 && (
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-1 truncate max-w-[160px] whitespace-nowrap shrink-0">
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
