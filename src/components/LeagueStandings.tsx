import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, AlertCircle, Hash, Award, Minus, X, BarChart3, Hash as HashIcon, CircleDot } from 'lucide-react';
import { LeagueStandingTable } from '../core/types.js';

interface LeagueStandingsProps {
  initialLeague?: string;
  selectedLeague?: string;
  onSelectLeague?: (league: string) => void;
  highlightTeams?: { homeTeam?: string; awayTeam?: string };
  compact?: boolean;
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
    <div className="space-y-4 font-sans">
      {!compact && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            League Standings
          </h2>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {POPULAR_LEAGUES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => handleLeagueChange(l.code)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 border ${
                  currentLeague === l.code
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent shadow-xs'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {compact && standingsData && (
        <div className="flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <Trophy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="text-xs font-bold text-slate-900 dark:text-white">
              {standingsData.leagueName} Table
            </span>
          </div>
          <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            {standingsData.source === 'FLASHSCORE_SCRAPED' ? 'Flashscore Live Table' : 'Database Table'}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="bg-white dark:bg-[#0B0F17] rounded-2xl p-6 border border-slate-200 dark:border-slate-800 space-y-2 animate-pulse">
          <div className="h-4 bg-slate-100 dark:bg-slate-900 rounded w-1/3 mb-4" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-9 bg-slate-100 dark:bg-slate-900 rounded flex items-center justify-between px-3" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="bg-white dark:bg-[#0B0F17] rounded-2xl p-8 border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <AlertCircle className="w-6 h-6 text-slate-400 mx-auto" />
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{error}</p>
          <button
            type="button"
            onClick={() => fetchStandings(currentLeague)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 cursor-pointer mt-2"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && standingsData && standingsData.table.length > 0 && (
        <div className="bg-white dark:bg-[#0B0F17] rounded-2xl border border-slate-100 dark:border-slate-800/80 overflow-hidden shadow-xs">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300">
                  <th className="py-3 pl-4 pr-2 text-center w-8">#</th>
                  <th className="py-3 px-3">Team</th>
                  <th className="py-3 px-2 text-center w-8" title="Played">MP</th>
                  <th className="py-3 px-2 text-center w-8" title="Won">W</th>
                  <th className="py-3 px-2 text-center w-8" title="Drawn">D</th>
                  <th className="py-3 px-2 text-center w-8" title="Lost">L</th>
                  <th className="py-3 px-2 text-center hidden sm:table-cell w-12" title="Goal Difference">GD</th>
                  <th className="py-3 px-3 text-center font-bold text-slate-900 dark:text-white w-10" title="Points">PTS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                {standingsData.table.map((row) => {
                  const highlightRole = isTeamHighlighted(row.teamName);
                  const isTop4 = row.rank <= 4;
                  const isRelegation = row.rank > standingsData.table.length - 3;

                  return (
                    <tr
                      key={`${row.rank}-${row.teamName}`}
                      className={`transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60 ${
                        highlightRole === 'HOME'
                          ? 'bg-sky-50/50 dark:bg-sky-950/20 font-bold border-l-4 border-sky-500'
                          : highlightRole === 'AWAY'
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 font-bold border-l-4 border-emerald-500'
                          : ''
                      }`}
                    >
                      <td className="py-2.5 pl-4 pr-2 text-center font-mono text-xs">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[11px] font-bold ${
                            isTop4
                              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-400'
                              : isRelegation
                              ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-400'
                              : 'text-slate-500 dark:text-slate-500'
                          }`}
                        >
                          {row.rank}
                        </span>
                      </td>

                      <td className="py-2.5 px-3 min-w-[140px]">
                        <div className="flex items-center gap-2.5">
                          {row.badge ? (
                            <img
                              src={row.badge}
                              alt=""
                              className="w-5 h-5 object-contain shrink-0 rounded-full"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0">
                              {row.teamName.slice(0, 1)}
                            </div>
                          )}
                          <span className="truncate text-slate-900 dark:text-white font-bold">
                            {row.teamName}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-2 text-center font-mono text-slate-600 dark:text-slate-400">{row.played}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-600 dark:text-slate-400">{row.won}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-600 dark:text-slate-400">{row.drawn}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-600 dark:text-slate-400">{row.lost}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-slate-600 dark:text-slate-400 hidden sm:table-cell">{row.goalDifference}</td>
                      <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900 dark:text-white">{row.points}</td>
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
