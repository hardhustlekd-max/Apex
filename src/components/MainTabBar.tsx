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
      className="bg-white dark:bg-[#0B0F17] px-2 sm:px-3 py-3 sticky top-[53px] z-20"
    >
      <div className="max-w-[99%] sm:max-w-[98%] mx-auto p-1 bg-white dark:bg-white text-slate-900 rounded-2xl flex items-center gap-1 overflow-x-auto no-scrollbar shadow-xs border border-slate-200/60">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              id={`tab-${tab.id.toLowerCase()}-btn`}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 min-w-[80px] sm:min-w-0 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 ${
                isActive
                  ? 'bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-[10px] px-2 py-0.5 rounded-lg font-bold ${
                  isActive ? 'bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
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
