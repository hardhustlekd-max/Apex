import React from 'react';
import { LiveScore } from '../providers/types.js';

interface LiveScoresTickerProps {
  liveScores: LiveScore[];
  providerName?: string;
}

export const LiveScoresTicker: React.FC<LiveScoresTickerProps> = ({ liveScores }) => {
  if (!liveScores || liveScores.length === 0) return null;

  return (
    <div className="bg-slate-50/95 dark:bg-slate-900/60 backdrop-blur-md px-4 py-2 transition-colors border-b border-slate-100 dark:border-slate-800 shadow-xs font-sans">
      <div className="max-w-6xl mx-auto flex items-center gap-3 overflow-x-auto no-scrollbar text-xs flex-nowrap">
        {/* IN-PLAY Badge */}
        <div className="flex items-center gap-1.5 shrink-0 font-bold text-[11px] text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1 rounded-xl shadow-xs whitespace-nowrap">
          <span>IN-PLAY</span>
        </div>

        {/* Live Scores Items */}
        <div className="flex items-center gap-2.5 flex-nowrap">
          {liveScores.map((s) => (
            <div
              key={s.fixtureId}
              className="flex items-center gap-2 bg-white dark:bg-slate-950 rounded-xl px-3 py-1.5 shrink-0 transition-all shadow-xs hover:shadow-sm whitespace-nowrap"
            >
              <span className="font-mono text-amber-600 dark:text-amber-400 font-bold text-[11px] shrink-0">
                {s.status === 'FINISHED' ? 'FT' : `${s.minute}'`}
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">{s.homeTeam}</span>
              <span className="font-mono font-bold bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white px-2 py-0.5 rounded-lg text-[11px] shadow-xs shrink-0 whitespace-nowrap">
                {s.homeScore} - {s.awayScore}
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">{s.awayTeam}</span>
              {s.events && s.events.length > 0 && (
                <span className="text-[10px] text-slate-600 dark:text-slate-400 font-medium ml-1 truncate max-w-[160px] whitespace-nowrap shrink-0">
                  {s.events[s.events.length - 1].type === 'GOAL' ? 'GOAL: ' : ''}
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
