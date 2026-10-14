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

      const res = await fetch(`/api/standings/${encodeURIComponent(cleanCode)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.standings) {
          setStandingsData(json.standings);
          return;
        }
      }

      const resFallback = await fetch(`/api/fixtures/standings/${encodeURIComponent(cleanCode)}`);
      if (resFallback.ok) {
        const json = await resFallback.json();
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
    <div className="space-y-3 font-sans">
      {!compact && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">League Standings</h2>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {POPULAR_LEAGUES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => handleLeagueChange(l.code)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 ${
                  currentLeague === l.code
                    ? 'bg-black text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
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
            <Trophy className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-bold text-slate-900">
              {standingsData.leagueName} Table
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            {standingsData.source === 'FLASHSCORE_SCRAPED' ? 'Flashscore Feed' : 'Database'}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="bg-white rounded-2xl p-4 border border-slate-100 space-y-2 animate-pulse">
          <div className="h-4 bg-slate-100 rounded-md w-1/3 mb-4" />
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-8 bg-slate-50 rounded-lg flex items-center justify-between px-3" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="bg-white rounded-2xl p-6 border border-slate-100 text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
          <p className="text-xs text-slate-600 font-medium">{error}</p>
          <button
            type="button"
            onClick={() => fetchStandings(currentLeague)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-black text-white cursor-pointer mt-2"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && standingsData && standingsData.table.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                  <th className="py-2.5 pl-3 pr-1 text-center w-8"><Hash className="w-3 h-3 mx-auto" /></th>
                  <th className="py-2.5 px-2">Team</th>
                  <th className="py-2.5 px-2 text-center w-8" title="Played"><HashIcon className="w-3 h-3 mx-auto" /></th>
                  <th className="py-2.5 px-2 text-center w-8" title="Won"><Trophy className="w-3 h-3 mx-auto" /></th>
                  <th className="py-2.5 px-2 text-center w-8" title="Drawn"><Minus className="w-3 h-3 mx-auto" /></th>
                  <th className="py-2.5 px-2 text-center w-8" title="Lost"><X className="w-3 h-3 mx-auto" /></th>
                  <th className="py-2.5 px-2 text-center hidden sm:table-cell w-12" title="Goal Difference"><BarChart3 className="w-3 h-3 mx-auto" /></th>
                  <th className="py-2.5 px-2 text-center font-extrabold text-slate-900 w-10" title="Points"><CircleDot className="w-3 h-3 mx-auto" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {standingsData.table.map((row) => {
                  const highlightRole = isTeamHighlighted(row.teamName);
                  const isTop4 = row.rank <= 4;
                  const isRelegation = row.rank > standingsData.table.length - 3;

                  return (
                    <tr
                      key={`${row.rank}-${row.teamName}`}
                      className={`transition-colors hover:bg-slate-50 ${
                        highlightRole === 'HOME'
                          ? 'bg-slate-100/50 font-bold border-l-2 border-black'
                          : highlightRole === 'AWAY'
                          ? 'bg-zinc-100/50 font-bold border-l-2 border-zinc-500'
                          : ''
                      }`}
                    >
                      <td className="py-2 pl-3 pr-1 text-center font-mono text-[11px]">
                        <span
                          className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-bold ${
                            isTop4
                              ? 'bg-slate-100 text-slate-700'
                              : isRelegation
                              ? 'bg-rose-50 text-rose-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {row.rank}
                        </span>
                      </td>

                      <td className="py-2 px-2 min-w-[130px]">
                        <div className="flex items-center gap-2">
                          {row.badge ? (
                            <img
                              src={row.badge}
                              alt=""
                              className="w-4 h-4 object-contain shrink-0"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-500 shrink-0">
                              {row.teamName.slice(0, 1)}
                            </div>
                          )}
                          <span className="truncate text-slate-900 font-semibold">
                            {row.teamName}
                          </span>
                        </div>
                      </td>

                      <td className="py-2 px-2 text-center font-mono text-slate-600">{row.played}</td>
                      <td className="py-2 px-2 text-center font-mono text-slate-600">{row.won}</td>
                      <td className="py-2 px-2 text-center font-mono text-slate-600">{row.drawn}</td>
                      <td className="py-2 px-2 text-center font-mono text-slate-600">{row.lost}</td>
                      <td className="py-2 px-2 text-center font-mono text-slate-600 hidden sm:table-cell">{row.goalDifference}</td>
                      <td className="py-2 px-2 text-center font-mono font-extrabold text-slate-900">{row.points}</td>
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
