import React, { useState, useEffect, useMemo } from 'react';
import { Search, Globe, Check } from 'lucide-react';
import { LeagueOptionDTO } from '../core/types.js';
import { EngineService } from '../services/engineService.js';
import { Input, Modal } from './ui/index.js';

interface LeagueSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLeague: string;
  onSelectLeague: (code: string) => void;
  leagues?: LeagueOptionDTO[];
}

export const LeagueSelectorModal: React.FC<LeagueSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedLeague,
  onSelectLeague,
  leagues: providedLeagues,
}) => {
  const [search, setSearch] = useState('');
  const [loadedLeagues, setLoadedLeagues] = useState<LeagueOptionDTO[]>([]);

  useEffect(() => {
    if (!isOpen && (!providedLeagues || providedLeagues.length === 0)) return;
    if (providedLeagues && providedLeagues.length > 0) {
      setLoadedLeagues(providedLeagues);
      return;
    }
    let cancelled = false;
    EngineService.getLeaguesCatalog().then((list) => {
      if (!cancelled && Array.isArray(list)) {
        setLoadedLeagues(list);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, providedLeagues]);

  const effectiveLeagues = providedLeagues && providedLeagues.length > 0 ? providedLeagues : loadedLeagues;

  const filteredLeagues = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return effectiveLeagues;
    return effectiveLeagues.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.country && l.country.toLowerCase().includes(q))
    );
  }, [search, effectiveLeagues]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-xl"
      title="Leagues"
      icon={<Globe className="w-4 h-4 stroke-[2.25]" />}
      closeLabel="Close league selector"
      bodyClassName="flex flex-col flex-1 min-h-0 overflow-hidden"
    >
      {/* Search Input Box */}
      <div className="px-3 sm:px-3.5 pt-2.5 pb-2 shrink-0">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          placeholder="Search by league name or country..."
          leftIcon={<Search className="w-4 h-4" />}
          inputSize="md"
          autoFocus
        />
      </div>

      {/* Leagues List */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-3.5 pb-3 overscroll-contain">
        <div className="rounded-xl border border-theme bg-theme-card divide-y overflow-hidden">
          <button
            type="button"
            onClick={() => {
              onSelectLeague('ALL');
              onClose();
            }}
            className={`w-full min-h-[34px] text-left flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-theme-subtle ${
              selectedLeague === 'ALL'
                ? 'bg-theme-primary-subtle font-semibold text-theme-primary'
                : 'hover:bg-theme-subtle/70 font-medium text-theme-main'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-theme-primary shrink-0" />
              <span className="text-base">All Leagues Worldwide</span>
            </div>
            {selectedLeague === 'ALL' && <Check className="w-3.5 h-3.5 text-theme-primary stroke-[3]" />}
          </button>

          {filteredLeagues.map((league, idx) => {
            const isSelected =
              selectedLeague.toUpperCase() === league.code.toUpperCase() ||
              selectedLeague.toLowerCase() === league.name.toLowerCase();
            return (
              <button
                key={`${league.code}-${idx}`}
                type="button"
                onClick={() => {
                  onSelectLeague(league.code);
                  onClose();
                }}
                className={`w-full min-h-[34px] text-left flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:bg-theme-subtle ${
                  isSelected
                    ? 'bg-theme-primary-subtle font-semibold text-theme-primary'
                    : 'hover:bg-theme-subtle/70 font-medium text-theme-main'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSelected ? 'bg-theme-primary' : 'bg-theme-sub/60'}`} />
                  <div className="min-w-0 flex items-baseline gap-1.5 truncate">
                    <span className="text-base truncate">{league.name}</span>
                    <span className="text-xs font-normal text-theme-sub truncate shrink-0">
                      {league.country || 'International'}
                    </span>
                  </div>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-theme-primary shrink-0 stroke-[3]" />}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
};
