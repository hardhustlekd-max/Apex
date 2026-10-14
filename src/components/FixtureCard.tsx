import React from 'react';
import { Info } from 'lucide-react';
import { Fixture } from '../core/types.js';

interface FixtureCardProps {
  fixture: Fixture;
  onSelectDetail: (fixture: Fixture) => void;
}

export const FixtureCard: React.FC<FixtureCardProps> = ({
  fixture,
  onSelectDetail,
}) => {
  const pred = fixture.prediction;

  const topPredictionLabel = pred
    ? pred.homeWinProb >= pred.awayWinProb && pred.homeWinProb >= pred.drawProb
      ? `${fixture.homeTeam} Win (${Math.round(pred.homeWinProb * 100)}%)`
      : pred.awayWinProb >= pred.homeWinProb && pred.awayWinProb >= pred.drawProb
      ? `${fixture.awayTeam} Win (${Math.round(pred.awayWinProb * 100)}%)`
      : `Draw (${Math.round(pred.drawProb * 100)}%)`
    : null;

  return (
    <div
      id={`fixture-card-${fixture.id}`}
      className="bg-white text-slate-900 rounded-xl sm:rounded-2xl p-4 transition-all shadow-xs hover:shadow-md border border-slate-200 flex flex-col justify-between group"
    >
      <div>
        {/* Top bar: League, Time, Stage / Status */}
        <div className="flex items-center justify-between gap-2 mb-3 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-nowrap overflow-hidden">
            <span className="text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-md sm:rounded-lg bg-slate-100 text-slate-800 shadow-2xs truncate whitespace-nowrap max-w-[150px] sm:max-w-[200px]" title={fixture.stage || fixture.leagueName}>
              {fixture.stage || fixture.leagueName}
            </span>
            <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap shrink-0">
              {fixture.kickOffTime}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 whitespace-nowrap">
            {pred && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md sm:rounded-lg bg-emerald-600 text-white shadow-2xs whitespace-nowrap" title={`Confidence: ${Math.round(Math.max(pred.homeWinProb, pred.drawProb, pred.awayWinProb) * 100)}%`}>
                {Math.round(Math.max(pred.homeWinProb, pred.drawProb, pred.awayWinProb))}% Conf
              </span>
            )}
            {fixture.status === 'LIVE' ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md sm:rounded-lg bg-black text-white shadow-2xs whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
            ) : fixture.status === 'FINISHED' ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md sm:rounded-lg bg-slate-100 text-slate-700 whitespace-nowrap">
                FT
              </span>
            ) : (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-md sm:rounded-lg bg-slate-50 text-slate-500 whitespace-nowrap">
                {fixture.matchDate}
              </span>
            )}
          </div>
        </div>

        {/* Teams & Expected Goals Display */}
        <div className="grid grid-cols-12 items-center gap-2 my-2">
          {/* Home Team */}
          <div className="col-span-5 flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 flex-nowrap">
              {fixture.homeBadge && (
                <img
                  src={fixture.homeBadge}
                  alt=""
                  className="w-4 h-4 object-contain shrink-0 rounded-full"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              )}
              <span className="text-sm font-bold text-black tracking-tight truncate whitespace-nowrap" title={fixture.homeTeam}>
                {fixture.homeTeam}
              </span>
              {pred?.homeWinProb !== undefined && (
                <span className="font-mono text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-black shadow-xs shrink-0 whitespace-nowrap" title={`${fixture.homeTeam} Win: ${Math.round(pred.homeWinProb * 100)}%`}>
                  {Math.round(pred.homeWinProb * 100)}%
                </span>
              )}
            </div>
            {pred && (
              <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap shrink-0">
                xG: <strong className="text-black">{pred.homeXG}</strong>
              </span>
            )}
          </div>

          {/* VS Divider or Match Score */}
          <div className="col-span-2 flex flex-col items-center justify-center shrink-0">
            {fixture.score && fixture.score.home !== undefined ? (
              <span className="text-xs sm:text-sm font-mono font-extrabold text-black whitespace-nowrap">
                {fixture.score.home}:{fixture.score.away}
              </span>
            ) : (
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest whitespace-nowrap">VS</span>
            )}
            <button
              onClick={() => onSelectDetail(fixture)}
              className="mt-0.5 text-[10px] text-black font-semibold hover:underline flex items-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              title="View Poisson probability matrix"
            >
              <Info className="w-3 h-3" />
              <span>Grid</span>
            </button>
          </div>

          {/* Away Team */}
          <div className="col-span-5 flex flex-col items-end text-right min-w-0">
            <div className="flex items-center justify-end gap-1.5 min-w-0 flex-nowrap w-full">
              {pred?.awayWinProb !== undefined && (
                <span className="font-mono text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-black shadow-xs shrink-0 whitespace-nowrap" title={`${fixture.awayTeam} Win: ${Math.round(pred.awayWinProb * 100)}%`}>
                  {Math.round(pred.awayWinProb * 100)}%
                </span>
              )}
              <span className="text-sm font-bold text-black tracking-tight truncate whitespace-nowrap" title={fixture.awayTeam}>
                {fixture.awayTeam}
              </span>
              {fixture.awayBadge && (
                <img
                  src={fixture.awayBadge}
                  alt=""
                  className="w-4 h-4 object-contain shrink-0 rounded-full"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
              )}
            </div>
            {pred && (
              <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap shrink-0">
                xG: <strong className="text-black">{pred.awayXG}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Extra Result Details */}
        {fixture.resultDetails && (fixture.resultDetails.regulationTime || fixture.resultDetails.penalties) && (
          <div className="text-center font-mono text-[10px] text-slate-500 py-0.5">
            {fixture.resultDetails.regulationTime && <span>Reg: {fixture.resultDetails.regulationTime} </span>}
            {fixture.resultDetails.penalties && <span className="font-bold text-black">(Pen: {fixture.resultDetails.penalties})</span>}
          </div>
        )}

        {/* Probability Bar Indicator */}
        {pred && (
          <div className="my-2.5 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
              <span className="text-black font-bold">Home: {(pred.homeWinProb * 100).toFixed(0)}%</span>
              <span className="text-slate-700 font-bold">Draw: {(pred.drawProb * 100).toFixed(0)}%</span>
              <span className="text-black font-bold">Away: {(pred.awayWinProb * 100).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 rounded-full flex overflow-hidden">
              <div
                style={{ width: `${pred.homeWinProb * 100}%` }}
                className="bg-black transition-all duration-500"
                title={`Home Win: ${(pred.homeWinProb * 100).toFixed(1)}%`}
              />
              <div
                style={{ width: `${pred.drawProb * 100}%` }}
                className="bg-slate-400 transition-all duration-500"
                title={`Draw: ${(pred.drawProb * 100).toFixed(1)}%`}
              />
              <div
                style={{ width: `${pred.awayWinProb * 100}%` }}
                className="bg-zinc-700 transition-all duration-500"
                title={`Away Win: ${(pred.awayWinProb * 100).toFixed(1)}%`}
              />
            </div>
          </div>
        )}

        {/* Highest Predicted Outcome */}
        {topPredictionLabel && (
          <div className="mt-1 mb-1 p-1.5 px-3 rounded-full bg-slate-50 border border-slate-200 flex items-center text-xs shadow-xs min-w-0">
            <div className="flex items-center gap-1.5 min-w-0 truncate">
              <span className="text-[10px] font-bold uppercase text-slate-500 shrink-0 whitespace-nowrap">Prediction:</span>
              <span className="font-semibold text-black truncate whitespace-nowrap">{topPredictionLabel}</span>
            </div>
          </div>
        )}
      </div>

      {/* 1X2 Probabilities Selection Grid */}
      {pred && (
        <div className="grid grid-cols-3 gap-1 pt-1">
          <button
            type="button"
            onClick={() => onSelectDetail(fixture)}
            className="p-1 rounded-lg text-center bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 transition-all flex flex-col items-center justify-center cursor-pointer shadow-xs min-w-0"
          >
            <span className="text-[9px] text-zinc-500 uppercase font-medium truncate w-full">Home</span>
            <span className="font-mono font-bold text-xs text-black truncate w-full">
              {Math.round(pred.homeWinProb * 100)}%
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectDetail(fixture)}
            className="p-1 rounded-lg text-center bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 transition-all flex flex-col items-center justify-center cursor-pointer shadow-xs min-w-0"
          >
            <span className="text-[9px] text-zinc-500 uppercase font-medium truncate w-full">Draw</span>
            <span className="font-mono font-bold text-xs text-black truncate w-full">
              {Math.round(pred.drawProb * 100)}%
            </span>
          </button>

          <button
            type="button"
            onClick={() => onSelectDetail(fixture)}
            className="p-1 rounded-lg text-center bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 transition-all flex flex-col items-center justify-center cursor-pointer shadow-xs min-w-0"
          >
            <span className="text-[9px] text-zinc-500 uppercase font-medium truncate w-full">Away</span>
            <span className="font-mono font-bold text-xs text-black truncate w-full">
              {Math.round(pred.awayWinProb * 100)}%
            </span>
          </button>
        </div>
      )}
    </div>
  );
};
