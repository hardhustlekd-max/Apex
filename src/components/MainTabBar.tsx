import React, { useState, useRef, useEffect } from 'react';
import { Filter, ChevronDown, Search } from 'lucide-react';
import { GLOBAL_LEAGUES_DATASET } from '../core/globalLeaguesDataset.js';

interface MainTabBarProps {
  activeTab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'TIPS';
  onSelectTab: (tab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'TIPS') => void;
}

export const MainTabBar: React.FC<MainTabBarProps> = ({
  activeTab,
  onSelectTab,
}) => {
  return (
    <div className="bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs relative z-50">
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-2 flex items-center justify-between gap-3">
        {/* Left tabs: Predictions, Accumulator */}
        <div className="flex items-center bg-zinc-100 p-0.5 rounded-lg shadow-xs shrink-0 overflow-x-auto no-scrollbar">
          <button
            id="tab-fixtures-btn"
            type="button"
            onClick={() => onSelectTab('FIXTURES')}
            className={`px-3 py-1 rounded-lg sm:rounded-xl text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'FIXTURES'
                ? 'bg-white text-black shadow-xs'
                : 'text-zinc-600 hover:text-black'
            }`}
          >
            Predictions
          </button>

          <button
            id="tab-accas-btn"
            type="button"
            onClick={() => onSelectTab('ACCAS')}
            className={`px-3 py-1 rounded-lg sm:rounded-xl text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'ACCAS'
                ? 'bg-white text-black shadow-xs'
                : 'text-zinc-600 hover:text-black'
            }`}
          >
            Accumulator
          </button>

          <button
            id="tab-standings-btn"
            type="button"
            onClick={() => onSelectTab('STANDINGS')}
            className={`px-3 py-1 rounded-lg sm:rounded-xl text-[11px] font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'STANDINGS'
                ? 'bg-white text-black shadow-xs'
                : 'text-zinc-600 hover:text-black'
            }`}
          >
            Standings
          </button>
        </div>
      </div>
    </div>
  );
};
