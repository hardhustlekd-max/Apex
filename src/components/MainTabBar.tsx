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
      aria-label="Repository"
      className="bg-[#f4f5f7] dark:bg-[#0a0a0a] px-2 sm:px-3 py-2 sticky top-[53px] z-20 transition-colors"
    >
      <div className="max-w-6xl w-full mx-auto p-1.5 bg-white dark:bg-[#121212] text-slate-900 dark:text-white rounded-full flex items-center gap-1.5 overflow-x-auto no-scrollbar shadow-sm border border-slate-200/80 dark:border-neutral-800">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              id={`tab-${tab.id.toLowerCase()}-btn`}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 min-w-[100px] sm:min-w-0 px-4 py-2.5 rounded-full text-xs sm:text-sm font-extrabold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 ${
                isActive
                  ? 'bg-[#121212] dark:bg-[#CCFF00] text-white dark:text-slate-950 shadow-md scale-[1.02]'
                  : 'text-slate-600 dark:text-neutral-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                  isActive
                    ? 'bg-[#CCFF00] dark:bg-slate-950 text-slate-950 dark:text-[#CCFF00]'
                    : 'bg-slate-100 dark:bg-neutral-800 text-slate-600 dark:text-neutral-400'
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
