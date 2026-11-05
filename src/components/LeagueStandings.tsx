import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, AlertCircle, Hash, Award, Minus, X, BarChart3, Hash as HashIcon, CircleDot, RefreshCw } from 'lucide-react';
import { LeagueStandingTable } from '../core/types.js';

interface LeagueStandingsProps {
  initialLeague?: string;
  selectedLeague?: string;
  onSelectLeague?: (league: string) => void;
  highlightTeams?: { homeTeam?: string; awayTeam?: string };
  compact?: boolean;
  onTriggerFullSync?: () => void;
}

const POPULAR_LEAGUES = [
  { code: 'england_premier_league', name: 'Premier League', country: 'England' },
  { code: 'spain_la_liga', name: 'La Liga', country: 'Spain' },
  { code: 'germany_bundesliga', name: 'Bundesliga', country: 'Germany' },
  { code: 'italy_serie_a', name: 'Serie A', country: 'Italy' },
  { code: 'france_ligue_1', name: 'Ligue 1', country: 'France' },
  { code: 'europe_champions_league_league_phase', name: 'Champions League', country: 'Europe' },
  { code: 'europe_europa_league_league_phase', name: 'Europa League', country: 'Europe' },
  { code: 'england_championship', name: 'Championship', country: 'England' },
  { code: 'netherlands_eredivisie', name: 'Eredivisie', country: 'Netherlands' },
  { code: 'portugal_primeira_liga', name: 'Liga Portugal', country: 'Portugal' },
  { code: 'brazil_serie_a', name: 'Série A', country: 'Brazil' },
  { code: 'usa_major_league_soccer', name: 'MLS', country: 'USA' },
];

export const LeagueStandings: React.FC<LeagueStandingsProps> = ({
  initialLeague = 'england_premier_league',
  selectedLeague: externalSelectedLeague,
  onSelectLeague: externalOnSelectLeague,
  highlightTeams,
  compact = false,
  onTriggerFullSync,
}) => {
  const [internalLeague, setInternalLeague] = useState<string>(
    initialLeague && initialLeague !== 'ALL' ? initialLeague : 'england_premier_league'
  );

  const currentLeague = (externalSelectedLeague && externalSelectedLeague !== 'ALL')
    ? externalSelectedLeague
    : internalLeague;

  const handleLeagueChange = (code: string) => {
    setInternalLeague(code);
    if (externalOnSelectLeague) {
      externalOnSelectLeague(code);
    }
  };

  const [standingsData, setStandingsData] = useState<LeagueStandingTable | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStandings = useCallback(async (leagueCode: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const cleanCode = (leagueCode || 'england_premier_league').trim();

      const res = await fetch(`/api/fixtures/standings/${encodeURIComponent(cleanCode)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.standings) {
          setStandingsData(json.standings);
          return;
        }
      }

      setError('No standings table available for this league');
      setStandingsData(null);
    } catch (err: any) {
      console.warn('Failed to load standings:', err);
      setError(err?.message || 'Error fetching standings');
      setStandingsData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const code = currentLeague && currentLeague !== 'ALL' ? currentLeague : 'england_premier_league';
    fetchStandings(code);
  }, [currentLeague, fetchStandings]);

  const homeTarget = highlightTeams?.homeTeam?.toLowerCase().trim();
  const awayTarget = highlightTeams?.awayTeam?.toLowerCase().trim();

  const isTeamHighlighted = (teamName: string): 'HOME' | 'AWAY' | null => {
    const t = teamName.toLowerCase().trim();
    if (homeTarget && t === homeTarget) return 'HOME';
    if (awayTarget && t === awayTarget) return 'AWAY';
    return null;
  };

  return (
    <div className="space-y-2.5 font-sans">
      {!compact && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
            League Standings
          </h2>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 p-1 bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] rounded-2xl shadow-xs">
            {POPULAR_LEAGUES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => handleLeagueChange(l.code)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 active:scale-95 ${
                  currentLeague === l.code
                    ? 'bg-[#FF001F] text-white font-extrabold shadow-sm scale-[1.02]'
                    : 'text-[#8F92A1] dark:text-[#9EA3B2] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {compact && standingsData && (
        <div className="flex items-center justify-between gap-1.5 px-1">
          <div className="flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-slate-400 dark:text-neutral-400" />
            <span className="text-xs font-extrabold text-slate-950 dark:text-white">
              {standingsData.leagueName} Table
            </span>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-neutral-400">
            {standingsData.source === 'FLASHSCORE_SCRAPED' ? 'Flashscore Live Table' : 'Database Table'}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="bg-white dark:bg-[#121212] rounded-2xl p-5 shadow-sm space-y-1.5 animate-pulse">
          <div className="h-3.5 bg-slate-100 dark:bg-neutral-800 rounded-full w-1/3 mb-3" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-6.5 bg-slate-100 dark:bg-neutral-800 rounded-xl flex items-center justify-between px-2.5" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="bg-white dark:bg-[#121212] rounded-2xl p-6 text-center space-y-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-slate-400 mx-auto" />
          <p className="text-xs text-slate-500 dark:text-neutral-400 font-medium">{error}</p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => fetchStandings(currentLeague)}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-neutral-200 cursor-pointer active:scale-95 shadow-xs"
            >
              Retry
            </button>
            {onTriggerFullSync && (
              <button
                type="button"
                onClick={onTriggerFullSync}
                className="px-3.5 py-1.5 rounded-full text-xs font-black bg-slate-950 text-[#CCFF00] dark:bg-[#CCFF00] dark:text-slate-950 cursor-pointer active:scale-95 shadow-xs flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Start Full Sync</span>
              </button>
            )}
          </div>
        </div>
      )}

      {!isLoading && standingsData && standingsData.table.length > 0 && (
        <div className="bg-white dark:bg-[#121212] rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 dark:bg-neutral-900/80 text-xs font-extrabold text-slate-800 dark:text-neutral-200">
                  <th className="py-2 pl-3 pr-1.5 text-center w-7 font-mono tabular-nums">#</th>
                  <th className="py-2 px-2.5">Team</th>
                  <th className="py-2 px-1.5 text-center w-7 font-mono tabular-nums" title="Played">MP</th>
                  <th className="py-2 px-1.5 text-center w-7 font-mono tabular-nums" title="Won">W</th>
                  <th className="py-2 px-1.5 text-center w-7 font-mono tabular-nums" title="Drawn">D</th>
                  <th className="py-2 px-1.5 text-center w-7 font-mono tabular-nums" title="Lost">L</th>
                  <th className="py-2 px-1.5 text-center hidden sm:table-cell w-10 font-mono tabular-nums" title="Goal Difference">GD</th>
                  <th className="py-2 px-2.5 text-center font-black text-slate-950 dark:text-white w-9 font-mono tabular-nums" title="Points">PTS</th>
                </tr>
              </thead>
              <tbody className="font-semibold">
                {standingsData.table.map((row) => {
                  const highlightRole = isTeamHighlighted(row.teamName);
                  const isTop4 = row.rank <= 4;
                  const isRelegation = row.rank > standingsData.table.length - 3;

                  return (
                    <tr
                      key={`${row.rank}-${row.teamName}`}
                      className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-neutral-800/40 ${
                        highlightRole === 'HOME'
                          ? 'bg-[#CCFF00]/15 text-slate-950 dark:text-white font-extrabold'
                          : highlightRole === 'AWAY'
                          ? 'bg-[#CCFF00]/15 text-slate-950 dark:text-white font-extrabold'
                          : ''
                      }`}
                    >
                      <td className="py-2 pl-3 pr-1.5 text-center font-mono tabular-nums text-[10.5px]">
                        <span
                          className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[8.5px] font-black ${
                            isTop4
                              ? 'bg-slate-950 text-[#CCFF00] dark:bg-[#CCFF00] dark:text-slate-950'
                              : isRelegation
                              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                              : 'text-slate-500 dark:text-neutral-400'
                          }`}
                        >
                          {row.rank}
                        </span>
                      </td>

                      <td className="py-2 px-2.5 min-w-[110px]">
                        <div className="flex items-center gap-1.5">
                          {row.badge ? (
                            <img
                              src={row.badge}
                              alt=""
                              className="w-3.5 h-3.5 object-contain shrink-0 rounded-full"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full bg-slate-100 dark:bg-neutral-800 flex items-center justify-center text-[7.5px] font-black text-slate-600 dark:text-neutral-300 shrink-0">
                              {row.teamName.slice(0, 1)}
                            </div>
                          )}
                          <span className="truncate text-slate-950 dark:text-white font-extrabold text-[10.5px]">
                            {row.teamName}
                          </span>
                        </div>
                      </td>

                      <td className="py-2 px-1.5 text-center font-mono tabular-nums text-slate-600 dark:text-neutral-300">{row.played}</td>
                      <td className="py-2 px-1.5 text-center font-mono tabular-nums text-slate-600 dark:text-neutral-300">{row.won}</td>
                      <td className="py-2 px-1.5 text-center font-mono tabular-nums text-slate-600 dark:text-neutral-300">{row.drawn}</td>
                      <td className="py-2 px-1.5 text-center font-mono tabular-nums text-slate-600 dark:text-neutral-300">{row.lost}</td>
                      <td className="py-2 px-1.5 text-center font-mono tabular-nums text-slate-600 dark:text-neutral-300 hidden sm:table-cell">{row.goalDifference}</td>
                      <td className="py-2 px-2.5 text-center font-mono tabular-nums font-black text-slate-950 dark:text-white">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
