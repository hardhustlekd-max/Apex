import React, { useState, useMemo } from 'react';
import { Search, Globe, Check } from 'lucide-react';
import { GLOBAL_LEAGUES_DATASET } from '../core/globalLeaguesDataset.js';
import { Input, Modal } from './ui/index.js';

interface LeagueSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLeague: string;
  onSelectLeague: (code: string) => void;
}

export const LeagueSelectorModal: React.FC<LeagueSelectorModalProps> = ({
  isOpen,
  onClose,
  selectedLeague,
  onSelectLeague,
}) => {
  const [search, setSearch] = useState('');

  const filteredLeagues = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return GLOBAL_LEAGUES_DATASET;
    return GLOBAL_LEAGUES_DATASET.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.country && l.country.toLowerCase().includes(q))
    );
  }, [search]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-xl"
      title="Leagues"
      icon={<Globe className="w-4.5 h-4.5 stroke-[2.5]" />}
      closeLabel="Close league selector"
      bodyClassName="flex flex-col flex-1 min-h-0 overflow-hidden"
    >
      {/* Search Input Box */}
      <div className="px-4 sm:px-6 pt-3 pb-2 shrink-0">
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClear={() => setSearch('')}
          placeholder="Search by league name or country..."
          leftIcon={<Search className="w-4 h-4" />}
          className="text-xs sm:text-sm font-extrabold"
          autoFocus
        />
      </div>

      {/* Leagues List */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 space-y-2 overscroll-contain">
        <button
          type="button"
          onClick={() => {
            onSelectLeague('ALL');
            onClose();
          }}
          className={`w-full text-left flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
            selectedLeague === 'ALL'
              ? 'bg-theme-primary-subtle font-black text-theme-primary shadow-theme-sm'
              : 'bg-theme-subtle hover:bg-theme-card-elevated text-theme-main'
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-theme-primary shrink-0" />
            <span className="text-xs sm:text-sm font-extrabold">All Leagues Worldwide</span>
          </div>
          {selectedLeague === 'ALL' && <Check className="w-4 h-4 text-theme-primary stroke-[3]" />}
        </button>

        {filteredLeagues.map((league, idx) => {
          const isSelected = selectedLeague.toUpperCase() === league.code.toUpperCase() || selectedLeague.toLowerCase() === league.name.toLowerCase();
          return (
            <button
              key={`${league.reep_id}-${idx}`}
              type="button"
              onClick={() => {
                onSelectLeague(league.code);
                onClose();
              }}
              className={`w-full text-left flex items-center justify-between px-4 py-2.5 rounded-full cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-theme-accent ${
                isSelected
                  ? 'bg-theme-primary-subtle font-black text-theme-primary shadow-theme-sm'
                  : 'bg-theme-subtle hover:bg-theme-card-elevated text-theme-main'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isSelected ? 'bg-theme-primary' : 'bg-theme-sub'}`} />
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-bold truncate">{league.name}</div>
                  <div className="text-xs font-mono text-theme-sub truncate">{league.country || 'International'}</div>
                </div>
              </div>
              {isSelected && <Check className="w-4 h-4 text-theme-primary shrink-0" />}
            </button>
          );
        })}
      </div>
    </Modal>
  );
};
