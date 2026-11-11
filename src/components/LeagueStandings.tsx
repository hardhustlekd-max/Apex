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
          <h2 className="text-sm sm:text-base font-extrabold text-theme-main">
            League Standings
          </h2>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 p-1 bg-theme-card border border-theme rounded-2xl shadow-xs">
            {POPULAR_LEAGUES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => handleLeagueChange(l.code)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 active:scale-95 ${
                  currentLeague === l.code
                    ? 'bg-theme-primary text-theme-primary-text font-black shadow-sm scale-[1.02]'
                    : 'text-theme-sub hover:text-theme-main'
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
            <Trophy className="w-3.5 h-3.5 text-theme-sub" />
            <span className="text-xs font-extrabold text-theme-main">
              {standingsData.leagueName} Table
            </span>
          </div>
          <span className="text-xs font-mono tabular-nums text-theme-sub">
            {standingsData.source === 'FLASHSCORE_SCRAPED' ? 'Flashscore Live Table' : 'Database Table'}
          </span>
        </div>
      )}

      {isLoading && (
        <div className="bg-theme-card rounded-2xl p-5 shadow-sm space-y-1.5 animate-pulse border border-theme">
          <div className="h-3.5 bg-theme-subtle rounded-full w-1/3 mb-3" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-6.5 bg-theme-subtle rounded-xl flex items-center justify-between px-2.5" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="bg-theme-card rounded-2xl p-6 text-center space-y-3 shadow-sm border border-theme">
          <AlertCircle className="w-5 h-5 text-theme-sub mx-auto" />
          <p className="text-xs text-theme-sub font-medium">{error}</p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => fetchStandings(currentLeague)}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-theme-subtle text-theme-main cursor-pointer active:scale-95 shadow-xs"
            >
              Retry
            </button>
            {onTriggerFullSync && (
              <button
                type="button"
                onClick={onTriggerFullSync}
                className="px-3.5 py-1.5 rounded-full text-xs font-black bg-theme-primary text-theme-primary-text cursor-pointer active:scale-95 shadow-xs flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Start Full Sync</span>
              </button>
            )}
          </div>
        </div>
      )}

      {!isLoading && standingsData && standingsData.table.length > 0 && (
        <div className="bg-theme-card rounded-2xl overflow-hidden shadow-sm border border-theme">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-theme-subtle text-xs font-extrabold text-theme-main">
                  <th className="py-2 pl-3 pr-1.5 text-center w-7 font-mono tabular-nums">#</th>
                  <th className="py-2 px-2.5">Team</th>
                  <th className="py-2 px-1.5 text-center w-7 font-mono tabular-nums" title="Played">MP</th>
                  <th className="py-2 px-1.5 text-center w-7 font-mono tabular-nums" title="Won">W</th>
                  <th className="py-2 px-1.5 text-center w-7 font-mono tabular-nums" title="Drawn">D</th>
                  <th className="py-2 px-1.5 text-center w-7 font-mono tabular-nums" title="Lost">L</th>
                  <th className="py-2 px-1.5 text-center hidden sm:table-cell w-10 font-mono tabular-nums" title="Goal Difference">GD</th>
                  <th className="py-2 px-2.5 text-center font-black text-theme-main w-9 font-mono tabular-nums" title="Points">PTS</th>
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
                      className={`transition-colors hover:bg-theme-subtle ${
                        highlightRole === 'HOME'
                          ? 'bg-theme-primary-subtle text-theme-main font-extrabold'
                          : highlightRole === 'AWAY'
                          ? 'bg-theme-primary-subtle text-theme-main font-extrabold'
                          : ''
                      }`}
                    >
                      <td className="py-2 pl-3 pr-1.5 text-center font-mono tabular-nums text-[10.5px]">
                        <span
                          className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[8.5px] font-black ${
                            isTop4
                              ? 'bg-theme-primary text-theme-primary-text'
                              : isRelegation
                              ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                              : 'text-theme-sub'
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
                            <div className="w-3.5 h-3.5 rounded-full bg-theme-subtle flex items-center justify-center text-[7.5px] font-black text-theme-sub shrink-0">
                              {row.teamName.slice(0, 1)}
                            </div>
                          )}
                          <span className="truncate text-theme-main font-extrabold text-[10.5px]">
                            {row.teamName}
                          </span>
                        </div>
                      </td>

                      <td className="py-2 px-1.5 text-center font-mono tabular-nums text-theme-sub">{row.played}</td>
                      <td className="py-2 px-1.5 text-center font-mono tabular-nums text-theme-sub">{row.won}</td>
                      <td className="py-2 px-1.5 text-center font-mono tabular-nums text-theme-sub">{row.drawn}</td>
                      <td className="py-2 px-1.5 text-center font-mono tabular-nums text-theme-sub">{row.lost}</td>
                      <td className="py-2 px-1.5 text-center font-mono tabular-nums text-theme-sub hidden sm:table-cell">{row.goalDifference}</td>
                      <td className="py-2 px-2.5 text-center font-mono tabular-nums font-black text-theme-main">{row.points}</td>
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
