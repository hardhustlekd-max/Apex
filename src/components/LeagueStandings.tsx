import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Trophy, AlertCircle, RefreshCw, Search } from 'lucide-react';
import { LeagueStandingGroup, LeagueStandingTable, StandingsCatalogItem } from '../core/types.js';
import { teamMatchScore } from '../core/feedParser.js';
import { EngineService } from '../services/engineService.js';
import {
  Button,
  Card,
  EmptyState,
  Input,
  LoadingState,
  SectionHeader,
  SegmentedTabs,
  Select,
  TeamAvatar,
} from './ui/index.js';

interface LeagueStandingsProps {
  initialLeague?: string;
  selectedLeague?: string;
  onSelectLeague?: (league: string) => void;
  leagueContext?: { leagueUrl?: string; leagueName?: string };
  preloadedStandings?: LeagueStandingTable | null;
  isLoadingPreloaded?: boolean;
  highlightTeams?: { homeTeam?: string; awayTeam?: string };
  compact?: boolean;
  onTriggerFullSync?: () => void;
  refreshKey?: number;
}

type AvailabilityFilter = 'SYNCED' | 'ALL';

const EMPTY_GROUPS: LeagueStandingGroup[] = [];

export const LeagueStandings: React.FC<LeagueStandingsProps> = ({
  initialLeague = 'england_premier_league',
  selectedLeague: externalSelectedLeague,
  onSelectLeague: externalOnSelectLeague,
  leagueContext,
  preloadedStandings,
  isLoadingPreloaded = false,
  highlightTeams,
  compact = false,
  onTriggerFullSync,
  refreshKey = 0,
}) => {
  const [internalLeague, setInternalLeague] = useState<string>(
    initialLeague && initialLeague !== 'ALL' ? initialLeague : 'england_premier_league'
  );

  useEffect(() => {
    if (initialLeague && initialLeague !== 'ALL') {
      setInternalLeague(initialLeague);
    }
  }, [initialLeague]);

  const currentLeague =
    externalSelectedLeague && externalSelectedLeague !== 'ALL' ? externalSelectedLeague : internalLeague;

  const handleLeagueChange = (code: string) => {
    setInternalLeague(code);
    if (externalOnSelectLeague) {
      externalOnSelectLeague(code);
    }
  };

  // Catalog state (only loaded in full-page mode)
  const [catalog, setCatalog] = useState<StandingsCatalogItem[]>([]);
  const [syncedCount, setSyncedCount] = useState<number>(0);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState<boolean>(!compact);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<string>('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('SYNCED');

  // Active table state
  const [fetchedStandingsData, setFetchedStandingsData] = useState<LeagueStandingTable | null>(null);
  const [isFetchingStandings, setIsFetchingStandings] = useState<boolean>(preloadedStandings === undefined);
  const [error, setError] = useState<string | null>(null);

  const usingPreloaded = preloadedStandings !== undefined;
  const standingsData = usingPreloaded ? preloadedStandings : fetchedStandingsData;
  const isLoading = usingPreloaded ? isLoadingPreloaded : isFetchingStandings;

  const fetchCatalog = useCallback(async () => {
    if (compact) return;
    try {
      setIsLoadingCatalog(true);
      const res = await EngineService.getStandingsCatalog();
      setCatalog(res.leagues);
      setSyncedCount(res.syncedCount);
      if (res.syncedCount === 0 && res.leagues.length > 0) {
        setAvailabilityFilter('ALL');
      }
    } catch {
      // Non-fatal; active league query still executes
    } finally {
      setIsLoadingCatalog(false);
    }
  }, [compact]);

  const fetchStandings = useCallback(async (leagueCode: string) => {
    try {
      setIsFetchingStandings(true);
      setError(null);
      const cleanCode = (leagueCode || 'england_premier_league').trim();
      const data = await EngineService.getLeagueStandings(cleanCode, {
        leagueUrl: leagueContext?.leagueUrl,
        leagueName: leagueContext?.leagueName,
        homeTeam: highlightTeams?.homeTeam,
        awayTeam: highlightTeams?.awayTeam,
      });
      if (data && Array.isArray(data.table) && data.table.length > 0) {
        setFetchedStandingsData(data);
        return;
      }

      setError('No standings table synced for this league yet');
      setFetchedStandingsData(data);
    } catch (err: any) {
      setError(err?.message || 'Error loading standings');
      setFetchedStandingsData(null);
    } finally {
      setIsFetchingStandings(false);
    }
  }, [leagueContext?.leagueUrl, leagueContext?.leagueName, highlightTeams?.homeTeam, highlightTeams?.awayTeam]);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog, refreshKey]);

  useEffect(() => {
    if (usingPreloaded) {
      if (!isLoadingPreloaded) {
        if (preloadedStandings && Array.isArray(preloadedStandings.table) && preloadedStandings.table.length > 0) {
          setError(null);
        } else {
          setError('No standings table synced for this league yet');
        }
      } else {
        setError(null);
      }
      return;
    }
    const code = currentLeague && currentLeague !== 'ALL' ? currentLeague : 'england_premier_league';
    void fetchStandings(code);
  }, [usingPreloaded, isLoadingPreloaded, preloadedStandings, currentLeague, fetchStandings, refreshKey]);

  const countryOptions = useMemo(() => {
    const countries = new Set<string>();
    for (const item of catalog) {
      if (item.country) countries.add(item.country);
    }
    const sorted = Array.from(countries).sort((a, b) => a.localeCompare(b));
    return [{ value: 'ALL', label: 'All Countries' }, ...sorted.map((c) => ({ value: c, label: c }))];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      if (availabilityFilter === 'SYNCED' && !item.hasStandings) return false;
      if (selectedCountry !== 'ALL' && item.country !== selectedCountry) return false;
      if (q) {
        const hay = `${item.name} ${item.country} ${item.code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [catalog, availabilityFilter, selectedCountry, searchQuery]);

  const homeTarget = highlightTeams?.homeTeam?.trim() || '';
  const awayTarget = highlightTeams?.awayTeam?.trim() || '';

  const isTeamHighlighted = useCallback(
    (teamName: string): 'HOME' | 'AWAY' | null => {
      if (!teamName) return null;
      const homeScore = homeTarget ? teamMatchScore(homeTarget, teamName) : 0;
      const awayScore = awayTarget ? teamMatchScore(awayTarget, teamName) : 0;
      if (homeScore > 0 && homeScore >= awayScore) return 'HOME';
      if (awayScore > 0) return 'AWAY';
      return null;
    },
    [homeTarget, awayTarget]
  );

  const displayGroups = useMemo<LeagueStandingGroup[]>(() => {
    if (!standingsData) return EMPTY_GROUPS;
    const rawGroups =
      Array.isArray(standingsData.groups) && standingsData.groups.length > 0
        ? standingsData.groups
        : Array.isArray(standingsData.table) && standingsData.table.length > 0
        ? [{ name: 'Standings', table: standingsData.table }]
        : EMPTY_GROUPS;

    if (compact && rawGroups.length > 1 && (homeTarget || awayTarget)) {
      return [...rawGroups].sort((a, b) => {
        const aHas = a.table.some((r) => isTeamHighlighted(r.teamName) !== null) ? 1 : 0;
        const bHas = b.table.some((r) => isTeamHighlighted(r.teamName) !== null) ? 1 : 0;
        return bHas - aHas;
      });
    }
    return rawGroups;
  }, [standingsData, compact, homeTarget, awayTarget, isTeamHighlighted]);

  const formatGD = (gd: number): string => {
    if (!Number.isFinite(gd)) return '0';
    return gd > 0 ? `+${gd}` : String(gd);
  };

  const getRankBadgeClass = (zoneCode: string | undefined, rank: number, totalRows: number): string => {
    const z = (zoneCode || '').toLowerCase();
    if (z.startsWith('q')) {
      return 'bg-theme-primary text-theme-primary-text shadow-theme-glow';
    }
    if (z.startsWith('p')) {
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-300';
    }
    if (z.startsWith('r')) {
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-400';
    }
    if (!zoneCode && totalRows >= 10) {
      if (rank <= 4) return 'bg-theme-primary text-theme-primary-text shadow-theme-glow';
      if (rank > totalRows - 3) return 'bg-rose-500/15 text-rose-700 dark:text-rose-400';
    }
    return 'text-theme-sub font-medium';
  };

  const renderGroupTable = (group: LeagueStandingGroup, showGroupHeader: boolean, groupIdx: number) => (
    <Card key={`${group.name}-${groupIdx}`} surface="default" padding="none" radius="2xl" className="overflow-hidden">
      {showGroupHeader && (
        <div className="min-h-[32px] px-3 py-1.5 bg-theme-header-grad border-b border-theme flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-theme-main truncate">{group.name}</span>
          <span className="text-xs font-normal text-theme-sub tabular-nums shrink-0">
            {group.table.length} teams
          </span>
        </div>
      )}
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="h-[32px] bg-theme-header-grad border-b border-theme text-2xs uppercase tracking-[0.06em] font-medium text-theme-sub">
              <th className="py-1.5 pl-2.5 pr-1 text-center w-8 tabular-nums">#</th>
              <th className="py-1.5 px-2">Team</th>
              <th className="py-1.5 px-1 text-center w-7 tabular-nums" title="Matches Played">MP</th>
              <th className="py-1.5 px-1 text-center w-7 tabular-nums" title="Won">W</th>
              <th className="py-1.5 px-1 text-center w-7 tabular-nums" title="Drawn">D</th>
              <th className="py-1.5 px-1 text-center w-7 tabular-nums" title="Lost">L</th>
              <th className="py-1.5 px-1 text-center w-8 tabular-nums" title="Goals For">GF</th>
              <th className="py-1.5 px-1 text-center w-8 tabular-nums" title="Goals Against">GA</th>
              <th className="py-1.5 px-1 text-center w-9 tabular-nums" title="Goal Difference">GD</th>
              <th className="py-1.5 px-2 text-center font-semibold text-theme-main w-10 tabular-nums" title="Points">PTS</th>
              <th className="py-1.5 pl-1 pr-2.5 text-right w-[108px]" title="Last 5 Matches">Form</th>
            </tr>
          </thead>
          <tbody className="font-normal divide-y divide-[var(--border-subdued)]">
            {group.table.map((row) => {
              const highlightRole = isTeamHighlighted(row.teamName);
              const badgeCls = getRankBadgeClass(row.zoneCode, row.rank, group.table.length);

              return (
                <tr
                  key={`${group.name}-${row.rank}-${row.teamName}`}
                  className={`h-[29px] transition-colors duration-150 hover:bg-theme-subtle/75 ${
                    highlightRole === 'HOME'
                      ? 'bg-theme-primary-subtle text-theme-main font-semibold'
                      : highlightRole === 'AWAY'
                      ? 'bg-sky-500/10 text-theme-main font-semibold'
                      : ''
                  }`}
                >
                  <td className="py-1 pl-2.5 pr-1 text-center tabular-nums text-xs">
                    <span
                      title={row.zoneLabel || undefined}
                      className={`inline-flex items-center justify-center w-[20px] h-[20px] rounded-full text-2xs font-bold ${badgeCls}`}
                    >
                      {row.rank}
                    </span>
                  </td>

                  <td className="py-1 px-2 min-w-[125px] max-w-[220px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <TeamAvatar src={row.badge} name={row.teamName} size="xs" />
                      <span className="truncate text-theme-main font-medium text-sm">
                        {row.teamName}
                      </span>
                      {highlightRole && (
                        <span
                          className={`text-2xs font-bold shrink-0 ${
                            highlightRole === 'HOME'
                              ? 'text-theme-primary'
                              : 'text-sky-700 dark:text-sky-400'
                          }`}
                        >
                          {highlightRole === 'HOME' ? 'H' : 'A'}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="py-1 px-1 text-center tabular-nums text-theme-sub">{row.played}</td>
                  <td className="py-1 px-1 text-center tabular-nums text-theme-sub">{row.won}</td>
                  <td className="py-1 px-1 text-center tabular-nums text-theme-sub">{row.drawn}</td>
                  <td className="py-1 px-1 text-center tabular-nums text-theme-sub">{row.lost}</td>
                  <td className="py-1 px-1 text-center tabular-nums text-theme-sub">{row.goalsFor}</td>
                  <td className="py-1 px-1 text-center tabular-nums text-theme-sub">{row.goalsAgainst}</td>
                  <td className="py-1 px-1 text-center tabular-nums text-theme-sub">
                    {formatGD(row.goalDifference)}
                  </td>
                  <td className="py-1 px-2 text-center tabular-nums font-semibold text-theme-main text-sm">
                    {row.points}
                  </td>

                  <td className="py-1 pl-1 pr-2.5 text-right whitespace-nowrap">
                    {row.form && row.form.length > 0 ? (
                      <div className="inline-flex items-center justify-end gap-0.5 tabular-nums">
                        {row.form.slice(0, 5).map((res, idx) => (
                          <span
                            key={idx}
                            aria-label={res === 'W' ? 'Win' : res === 'D' ? 'Draw' : 'Loss'}
                            className={`w-[17px] h-[17px] rounded-full inline-flex items-center justify-center text-2xs leading-none font-bold ${
                              res === 'W'
                                ? 'bg-theme-primary text-theme-primary-text'
                                : res === 'D'
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-rose-600 text-white'
                            }`}
                          >
                            {res}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-2xs text-theme-dim tabular-nums">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const tableArea = (
    <div className="space-y-2.5 min-w-0">
      {!compact && standingsData && (
        <div className="min-h-[34px] flex flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-theme-main tracking-[-0.015em] truncate">
              {standingsData.leagueName}
            </h2>
            <p className="text-xs text-theme-sub tabular-nums truncate">
              <span>{standingsData.country || 'International'}</span>
              {displayGroups.length > 1 && <span> · {displayGroups.length} groups</span>}
              {standingsData.table.length > 0 && <span> · {standingsData.table.length} teams</span>}
            </p>
          </div>
          <Button
            variant="secondary"
            size="xs"
            onClick={() => fetchStandings(currentLeague)}
            disabled={isLoading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      )}

      {compact && standingsData && (
        <div className="min-h-[32px] flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Trophy className="w-4 h-4 text-theme-primary shrink-0" />
            <span className="text-base font-semibold text-theme-main tracking-[-0.01em] truncate">
              {standingsData.leagueName} Table
            </span>
          </div>
          <span className="text-xs font-normal tabular-nums text-theme-sub shrink-0">
            Flashscore Table
          </span>
        </div>
      )}

      {isLoading && <LoadingState variant="skeleton" rows={8} />}

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

      {!isLoading && !error && displayGroups.length > 0 && (
        <div className="space-y-2.5">
          {displayGroups.map((grp, idx) => renderGroupTable(grp, displayGroups.length > 1, idx))}
        </div>
      )}
    </div>
  );

  if (compact) {
    return <div className="space-y-2.5 font-sans">{tableArea}</div>;
  }

  return (
    <div className="space-y-2.5 font-sans">
      <div className="flex items-center justify-between gap-2">
        <SectionHeader
          title="Standings"
          icon={<Trophy className="w-4 h-4" />}
          action={
            catalog.length > 0 ? (
              <span className="text-xs font-normal tabular-nums text-theme-sub whitespace-nowrap">
                {syncedCount} synced tables · {catalog.length} catalog leagues
              </span>
            ) : undefined
          }
          size="md"
          className="w-full"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Left Filterable Directory */}
        <Card
          surface="default"
          padding="none"
          radius="2xl"
          className="lg:col-span-4 overflow-hidden lg:sticky lg:top-[56px]"
        >
          <div className="p-2.5 border-b border-theme space-y-2 bg-theme-header-grad">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery('')}
              placeholder="Search leagues or countries..."
              leftIcon={<Search className="w-3.5 h-3.5" />}
              inputSize="sm"
              surface="card"
              aria-label="Search standings leagues"
            />

            <div className="flex items-center gap-1.5">
              <Select
                options={countryOptions}
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                selectSize="sm"
                surface="card"
                containerClassName="flex-1 min-w-0"
                aria-label="Filter by country"
              />
            </div>

            <SegmentedTabs<AvailabilityFilter>
              items={[
                { id: 'SYNCED', label: 'With Tables', count: syncedCount },
                { id: 'ALL', label: 'All Leagues', count: catalog.length },
              ]}
              value={availabilityFilter}
              onChange={(val) => setAvailabilityFilter(val)}
              variant="subtle"
              size="xs"
              fullWidth
              ariaLabel="Filter standings availability"
            />
          </div>

          <div className="max-h-[260px] lg:max-h-[calc(100vh-260px)] overflow-y-auto overscroll-contain divide-y divide-[var(--border-subdued)]">
            {isLoadingCatalog && catalog.length === 0 ? (
              <div className="p-2.5 space-y-1.5">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-[34px] rounded-lg bg-theme-subtle animate-pulse" />
                ))}
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="py-6 px-3 text-center space-y-2">
                <p className="text-sm text-theme-sub">No matching leagues</p>
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCountry('ALL');
                    setAvailabilityFilter('ALL');
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            ) : (
              filteredCatalog.map((item) => {
                const isSelected =
                  currentLeague.toLowerCase() === item.code.toLowerCase() ||
                  standingsData?.leagueCode?.toLowerCase() === item.code.toLowerCase();
                return (
                  <button
                    key={`${item.code}-${item.leagueUrl || item.name}`}
                    type="button"
                    onClick={() => handleLeagueChange(item.code)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                      isSelected
                        ? 'bg-theme-primary-subtle border-l-2 border-l-theme-primary'
                        : 'hover:bg-theme-subtle/75'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-2xs uppercase tracking-[0.05em] text-theme-dim block truncate">
                        {item.country}
                      </span>
                      <span
                        className={`text-sm truncate block ${
                          isSelected ? 'font-semibold text-theme-primary' : 'font-medium text-theme-main'
                        }`}
                      >
                        {item.name}
                      </span>
                    </div>

                    <div className="shrink-0 text-right tabular-nums text-2xs text-theme-sub whitespace-nowrap">
                      {item.hasStandings ? (
                        <span>
                          {item.teamCount} teams
                          {item.groupCount > 1 ? ` · ${item.groupCount} grps` : ''}
                        </span>
                      ) : (
                        <span className="text-theme-dim">Pending</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {/* Right Standings Table Workspace */}
        <div className="lg:col-span-8 min-w-0">
          {tableArea}
        </div>
      </div>
    </div>
  );
};
