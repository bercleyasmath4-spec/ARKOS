
import React from 'react';
import GlassCard from './GlassCard';
import { TimelineItem } from '../types';

interface TimelineProps {
  items: TimelineItem[];
}

const Timeline: React.FC<TimelineProps> = ({ items }) => {
  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-[11px] font-bold tracking-widest text-white/50 uppercase">Schedule</h2>
        <button className="text-xs text-cyan-400 hover:underline">Full Calendar</button>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <GlassCard key={item.id} className="flex items-center gap-4 py-3">
            <div 
              className="w-1 h-10 rounded-full shrink-0" 
              style={{ backgroundColor: item.color }}
            />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-white truncate">{item.title}</h4>
              <p className="text-[11px] text-white/40 truncate">{item.sub}</p>
            </div>
            <span className="text-xs text-white/50 whitespace-nowrap">{item.time}</span>
          </GlassCard>
        ))}
      </div>
    </div>
  );
};

export default Timeline;
