import React from 'react';
import { Target, Layers, Trophy, History } from 'lucide-react';

interface MainTabBarProps {
  activeTab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'TIPS' | 'HISTORY';
  onSelectTab: (tab: 'FIXTURES' | 'ACCAS' | 'STANDINGS' | 'TIPS' | 'HISTORY') => void;
}

export const MainTabBar: React.FC<MainTabBarProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const tabs = [
    {
      id: 'FIXTURES' as const,
      label: 'Predictions',
      icon: Target,
      count: undefined,
    },
    {
      id: 'ACCAS' as const,
      label: 'Accumulators',
      icon: Layers,
      count: '4',
    },
    {
      id: 'STANDINGS' as const,
      label: 'Standings',
      icon: Trophy,
      count: undefined,
    },
    {
      id: 'HISTORY' as const,
      label: 'History',
      icon: History,
      count: undefined,
    },
  ];

  return (
    <nav
      aria-label="Primary Navigation"
      className="bg-[#F8FAFC] dark:bg-[#09090B] px-2.5 sm:px-4 py-2 sticky top-[56px] z-20 transition-colors font-sans"
    >
      <div className="max-w-6xl w-full mx-auto p-1.5 bg-white dark:bg-[#121216] text-slate-900 dark:text-white rounded-2xl flex items-center gap-1.5 overflow-x-auto no-scrollbar shadow-xs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              id={`tab-${tab.id.toLowerCase()}-btn`}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 min-w-[120px] sm:min-w-0 min-h-[44px] px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 active:scale-95 focus-visible:ring-2 focus-visible:ring-cyan-500 ${
                isActive
                  ? 'bg-[#CCFF00] text-slate-950 shadow-xs font-black'
                  : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#18181D]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-[11px] px-2 py-0.5 rounded font-black font-mono tabular-nums ${
                  isActive
                    ? 'bg-slate-950 text-[#CCFF00]'
                    : 'bg-slate-100 dark:bg-[#18181D] text-slate-700 dark:text-neutral-300'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
