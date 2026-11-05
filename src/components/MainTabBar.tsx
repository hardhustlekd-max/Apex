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
      className="bg-[#F8F9FA] dark:bg-[#0B0C0E] px-3 sm:px-6 py-2 sticky top-[56px] z-20 transition-colors"
    >
      <div className="max-w-6xl w-full mx-auto p-1 bg-white dark:bg-[#15161C] border border-[#ECEEF2] dark:border-[#20232D] text-slate-900 dark:text-white rounded-2xl flex items-center gap-1.5 overflow-x-auto no-scrollbar shadow-xs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              id={`tab-${tab.id.toLowerCase()}-btn`}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 min-w-[110px] sm:min-w-0 min-h-[40px] px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap flex items-center justify-center gap-2 active:scale-95 ${
                isActive
                  ? 'bg-[#FF001F] text-white shadow-xs font-bold'
                  : 'text-[#8F92A1] dark:text-[#9EA3B2] hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#1E2027]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-bold font-mono tabular-nums ${
                  isActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-[#20232D] text-slate-700 dark:text-neutral-300'
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
