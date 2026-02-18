
import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Clock } from 'lucide-react';
import { Task, PriorityLevel } from '../types';
import GlassCard from './GlassCard';
import { PRIORITY_COLORS } from '../constants';

interface CalendarViewProps {
  tasks: Task[];
}

const CalendarView: React.FC<CalendarViewProps> = ({ tasks }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  // Helper to check if a task happened on a specific day
  const getTasksForDay = (day: number, dateObj: Date) => {
    const checkDateStr = new Date(dateObj.getFullYear(), dateObj.getMonth(), day).toISOString().split('T')[0];
    
    return tasks.filter(task => {
        // If completed, use the completion date
        if (task.completed && task.lastCompletedDate) {
            return task.lastCompletedDate === checkDateStr;
        }
        // If not completed (or missing completion date), use start time
        const taskDateStr = task.startTime.split('T')[0];
        return taskDateStr === checkDateStr;
    });
  };

  const renderCalendarDays = () => {
    const totalDays = daysInMonth(currentDate);
    const startDay = firstDayOfMonth(currentDate);
    const days = [];

    // Empty cells for days before start of month
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-10 w-full" />);
    }

    // Actual days
    for (let d = 1; d <= totalDays; d++) {
        const checkDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), d);
        const isSelected = selectedDay.toDateString() === checkDate.toDateString();
        const isToday = new Date().toDateString() === checkDate.toDateString();
        
        const dayTasks = getTasksForDay(d, currentDate);
        const hasCompleted = dayTasks.some(t => t.completed);
        const hasPending = dayTasks.some(t => !t.completed);

        days.push(
            <button
                key={d}
                onClick={() => setSelectedDay(checkDate)}
                className={`h-10 w-full rounded-xl flex flex-col items-center justify-center relative transition-all ${
                    isSelected ? 'bg-cyan-400 text-black font-bold shadow-lg shadow-cyan-400/20' : 
                    isToday ? 'bg-white/10 text-cyan-400 border border-cyan-400/50' : 'text-white/60 hover:bg-white/5'
                }`}
            >
                <span className="text-xs">{d}</span>
                <div className="flex gap-0.5 mt-1">
                    {hasCompleted && <div className="w-1 h-1 rounded-full bg-green-400" />}
                    {hasPending && <div className="w-1 h-1 rounded-full bg-white/30" />}
                </div>
            </button>
        );
    }
    return days;
  };

  const selectedDayTasks = useMemo(() => {
    return getTasksForDay(selectedDay.getDate(), selectedDay);
  }, [selectedDay, tasks, currentDate]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
        {/* Calendar Header */}
        <div className="flex justify-between items-center mb-6 px-2">
            <h2 className="text-xl font-bold text-white tracking-widest uppercase">
                {monthNames[currentDate.getMonth()]} <span className="text-cyan-400">{currentDate.getFullYear()}</span>
            </h2>
            <div className="flex gap-2">
                <button onClick={handlePrevMonth} className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all"><ChevronLeft size={16} /></button>
                <button onClick={handleNextMonth} className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-all"><ChevronRight size={16} /></button>
            </div>
        </div>

        {/* Calendar Grid */}
        <GlassCard className="p-4 mb-8">
            <div className="grid grid-cols-7 gap-2 mb-2 text-center">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                    <div key={i} className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{day}</div>
                ))}
            </div>
            <div className="grid grid-cols-7 gap-2 row-auto">
                {renderCalendarDays()}
            </div>
        </GlassCard>

        {/* Selected Day Details */}
        <div className="space-y-4">
            <h3 className="text-xs font-bold text-white/40 uppercase tracking-[0.2em] px-2 mb-4">
                {selectedDay.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>

            {selectedDayTasks.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-3xl opacity-20">
                    <Clock size={32} className="mb-2" />
                    <span className="text-[9px] font-bold uppercase tracking-widest">No activity recorded</span>
                </div>
            ) : (
                selectedDayTasks.map(task => (
                    <GlassCard key={task.id} className="py-4 px-5 flex items-center gap-4 border-white/5 group">
                        <div className={`p-2 rounded-full ${task.completed ? 'bg-green-500/10 text-green-500' : 'bg-white/5 text-white/20'}`}>
                            {task.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className={`text-sm font-bold ${task.completed ? 'text-white/30 line-through' : 'text-white'}`}>{task.title}</h4>
                            <div className="flex flex-wrap items-center gap-3 mt-1.5">
                                <span className="text-[8px] font-bold uppercase px-2 py-0.5 rounded-md border border-white/10 bg-white/5" style={{ color: (PRIORITY_COLORS as any)[task.priority] }}>{task.priority}</span>
                                {task.completed && <span className="text-[8px] font-bold uppercase tracking-widest text-green-400">Completed</span>}
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-[9px] font-mono text-white/30 block">
                                {new Date(task.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </span>
                        </div>
                    </GlassCard>
                ))
            )}
        </div>
    </div>
  );
};

export default CalendarView;
