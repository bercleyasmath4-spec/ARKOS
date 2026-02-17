
import React from 'react';
import GlassCard from './GlassCard';
import { PriorityTask, Budget } from '../types';
import { THEME } from '../constants';

interface DashboardGridProps {
  priorityTask: PriorityTask;
  budget: Budget;
}

const DashboardGrid: React.FC<DashboardGridProps> = ({ priorityTask, budget }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
      <GlassCard className="h-32 flex flex-col justify-center">
        <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_red]"></div>
        <span className="text-[10px] font-bold tracking-widest text-white/50 mb-2">NEXT TASK</span>
        <h3 className="text-xl font-semibold text-white">{priorityTask.title}</h3>
        <p className="text-sm text-cyan-400">{priorityTask.time}</p>
      </GlassCard>

      <GlassCard className="h-32 flex flex-col justify-center">
        <span className="text-[10px] font-bold tracking-widest text-white/50 mb-2">BUDGET STATUS</span>
        <h3 className="text-xl font-semibold text-white">{budget.total}</h3>
        <p className="text-sm text-green-400">{budget.trend}</p>
      </GlassCard>
    </div>
  );
};

export default DashboardGrid;
