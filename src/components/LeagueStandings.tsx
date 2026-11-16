import React, { useState, useEffect, useCallback } from 'react';
import { Trophy, AlertCircle, RefreshCw } from 'lucide-react';
import { LeagueStandingTable } from '../core/types.js';
import { Button, Card, EmptyState, LoadingState, SectionHeader, TeamAvatar } from './ui/index.js';

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

  const currentLeague =
    externalSelectedLeague && externalSelectedLeague !== 'ALL' ? externalSelectedLeague : internalLeague;

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
          <SectionHeader title="Standings" size="md" />
          <div
            role="tablist"
            aria-label="League standings selector"
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 p-1 bg-theme-card rounded-2xl shadow-theme-sm"
          >
            {POPULAR_LEAGUES.map((l) => (
              <button
                key={l.code}
                type="button"
                role="tab"
                aria-selected={currentLeague === l.code}
                onClick={() => handleLeagueChange(l.code)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-150 whitespace-nowrap cursor-pointer shrink-0 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                  currentLeague === l.code
                    ? 'bg-theme-primary text-theme-primary-text font-black shadow-theme-glow'
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

      {isLoading && <LoadingState variant="skeleton" rows={6} />}

      {!isLoading && error && (
        <EmptyState
          icon={<AlertCircle className="w-5 h-5" />}
          title={error}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => fetchStandings(currentLeague)}>
                Retry
              </Button>
              {onTriggerFullSync && (
                <Button variant="primary" size="sm" onClick={onTriggerFullSync}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Start Full Sync</span>
                </Button>
              )}
            </>
          }
        />
      )}

      {!isLoading && standingsData && standingsData.table.length > 0 && (
        <Card surface="default" padding="none" radius="2xl" className="overflow-hidden">
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-theme-card-elevated text-xs font-extrabold text-theme-main">
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
                      className={`transition-colors duration-150 hover:bg-theme-subtle ${
                        highlightRole === 'HOME' || highlightRole === 'AWAY'
                          ? 'bg-theme-primary-subtle text-theme-main font-extrabold'
                          : 'odd:bg-theme-card even:bg-theme-card-elevated/45'
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
                          <TeamAvatar src={row.badge} name={row.teamName} size="xs" />
                          <span className="truncate text-theme-main font-extrabold text-[11px]">
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
        </Card>
      )}
    </div>
  );
};
