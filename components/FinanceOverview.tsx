
import React from 'react';
import * as Icons from 'lucide-react';
import { FinanceItem } from '../types';

interface FinanceOverviewProps {
  items: FinanceItem[];
}

const FinanceOverview: React.FC<FinanceOverviewProps> = ({ items }) => {
  return (
    <div className="mb-24">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-[11px] font-bold tracking-widest text-white/50 uppercase">Finance Overview</h2>
        <Icons.BarChart3 className="w-4 h-4 text-cyan-400" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item, idx) => {
          const IconComponent = (Icons as any)[item.icon] || Icons.HelpCircle;
          return (
            <div key={idx} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center transition-colors hover:bg-white/10">
              <IconComponent className="w-5 h-5 text-cyan-400 mb-2 opacity-80" />
              <span className="text-[10px] font-semibold text-white/50 tracking-wider">{item.label}</span>
              <span className="text-sm font-bold text-white mt-1">{item.val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default FinanceOverview;
