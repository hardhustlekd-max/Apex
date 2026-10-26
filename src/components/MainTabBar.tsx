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
      className="bg-[#f4f5f7] dark:bg-[#09090B] px-2 sm:px-3 py-2 sticky top-[56px] z-20 transition-colors"
    >
      <div className="max-w-6xl w-full mx-auto p-1.5 bg-white dark:bg-[#121216] text-slate-900 dark:text-white rounded-full flex items-center gap-1.5 overflow-x-auto no-scrollbar shadow-xs border border-slate-200/80 dark:border-[#27272A]">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              id={`tab-${tab.id.toLowerCase()}-btn`}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 min-w-[100px] sm:min-w-0 min-h-[48px] px-3.5 sm:px-5 py-2.5 rounded-full text-xs sm:text-sm font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 active:scale-95 ${
                isActive
                  ? 'bg-[#09090B] dark:bg-[#CCFF00] text-white dark:text-slate-950 shadow-md font-black scale-[1.02]'
                  : 'text-slate-600 dark:text-neutral-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black font-mono tabular-nums ${
                  isActive
                    ? 'bg-[#CCFF00] dark:bg-slate-950 text-slate-950 dark:text-[#CCFF00]'
                    : 'bg-slate-100 dark:bg-[#18181D] text-slate-600 dark:text-neutral-400 border border-transparent dark:border-[#27272A]'
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
