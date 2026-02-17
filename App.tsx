import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Settings, X, Plus, Trash2, CheckCircle2, 
  Circle, Activity, Search, Bell, Shield, User, LogOut, Lock, Unlock, Loader2, BarChart2, ClipboardList, Mail, Send, DollarSign, CreditCard, TrendingDown, Edit2, Clock, Filter, Check, Cloud, Sparkles
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { INITIAL_STATE, PRIORITY_COLORS } from './constants.tsx';
import { DashboardState, Task, Expense, PriorityLevel, ExpenseCategory, TaskType, PerformanceReport, NotificationSettings, NotificationLog } from './types.ts';
import JarvisOrb from './components/JarvisOrb.tsx';
import NavigationBar, { TabType } from './components/NavigationBar.tsx';
import GlassCard from './components/GlassCard.tsx';
import FinanceOverview from './components/FinanceOverview.tsx';
import { GeminiVoiceService } from './services/geminiLive.ts';
import { NotificationService } from './services/notificationService.ts';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';
import Login from './components/Login.tsx';
import { supabase } from './lib/supabaseClient.ts';

const Dashboard: React.FC = () => {
    const { user, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('home');
    const [taskTab, setTaskTab] = useState<TaskType>('Daily');
    const [showSettings, setShowSettings] = useState(false);
    const [showAddModal, setShowAddModal] = useState<'task' | 'expense' | null>(null);
    const [performanceReport, setPerformanceReport] = useState<PerformanceReport | null>(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [isEmailing, setIsEmailing] = useState(false);
    const [isTestingEmail, setIsTestingEmail] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [aiInsight, setAiInsight] = useState<string | null>(null);
    const [isInsightLoading, setIsInsightLoading] = useState(false);
    
    // Filtering State
    const [priorityFilter, setPriorityFilter] = useState<'All' | PriorityLevel>('All');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Completed'>('All');

    // Voice & Diagnostic State
    const [isListening, setIsListening] = useState(false);

    // Email Security State
    const [isEmailLocked, setIsEmailLocked] = useState(true);
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState('');
    const [unlockError, setUnlockError] = useState<string | null>(null);
    const [tempEmail, setTempEmail] = useState('');
    
    // Internal state management
    const [state, setState] = useState<DashboardState>(INITIAL_STATE);
    const [isLoaded, setIsLoaded] = useState(false);

    const voiceService = useRef<GeminiVoiceService | null>(null);
    const notificationService = useRef<NotificationService>(new NotificationService());

    // Initial Load: Local -> Cloud
    useEffect(() => {
        const loadPersistence = async () => {
            if (!user) return;
            const storageKey = `arkos_db_${user.id}`;
            const localSaved = localStorage.getItem(storageKey);
            const cloudSaved = user.user_metadata?.arkos_state;
            
            let finalState = INITIAL_STATE;
            if (cloudSaved) {
                finalState = cloudSaved;
            } else if (localSaved) {
                try {
                    finalState = JSON.parse(localSaved);
                } catch (e) {
                    console.error("Local load failed", e);
                }
            }

            setState({
                ...INITIAL_STATE,
                ...finalState,
                tasks: Array.isArray(finalState.tasks) ? finalState.tasks : [],
                expenses: Array.isArray(finalState.expenses) ? finalState.expenses : [],
                notificationLogs: Array.isArray(finalState.notificationLogs) ? finalState.notificationLogs : []
            });
            setIsLoaded(true);
        };
        loadPersistence();
    }, [user]);

    // Debounced Sync to Supabase & LocalStorage
    useEffect(() => {
        if (!isLoaded || !user) return;

        const syncData = async () => {
            setIsSyncing(true);
            const storageKey = `arkos_db_${user.id}`;
            localStorage.setItem(storageKey, JSON.stringify(state));

            try {
                await supabase.auth.updateUser({
                    data: { arkos_state: state }
                });
            } catch (err) {
                console.error("Cloud sync failed", err);
            } finally {
                setTimeout(() => setIsSyncing(false), 800);
            }
        };

        const timeout = setTimeout(syncData, 2000);
        return () => clearTimeout(timeout);
    }, [state, user, isLoaded]);

    const getAiInsight = async () => {
        setIsInsightLoading(true);
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        try {
            const taskData = state.tasks.map(t => `${t.title} (${t.priority}, ${t.completed ? 'Done' : 'Pending'})`).join(', ');
            const budgetData = `Spent: ${state.expenses.reduce((a, b) => a + b.amount, 0)}, Limit: ${state.budgetConfig.limit}`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-lite-preview',
                contents: `Analyze my current state and give me one helpful sentence of advice. 
                Tasks: ${taskData}. 
                Budget: ${budgetData}. 
                Be friendly and conversational.`
            });
            setAiInsight(response.text || "You're doing great! Keep it up.");
        } catch (err) {
            console.error(err);
        } finally {
            setIsInsightLoading(false);
        }
    };

    // Task Filtering Logic
    const filteredTasks = useMemo(() => {
        return state.tasks.filter(t => {
            const matchesType = t.type === taskTab;
            const matchesPriority = priorityFilter === 'All' || t.priority === priorityFilter;
            const matchesStatus = statusFilter === 'All' || 
                (statusFilter === 'Pending' && !t.completed) || 
                (statusFilter === 'Completed' && t.completed);
            return matchesType && matchesPriority && matchesStatus;
        });
    }, [state.tasks, taskTab, priorityFilter, statusFilter]);

    const nextTask = useMemo(() => {
        const pending = state.tasks
            .filter(t => !t.completed)
            .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        return pending[0] || null;
    }, [state.tasks]);

    const formatTimeRange = (start: string, end: string) => {
        const s = new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const e = new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        return `${s} - ${e}`;
    };

    const getTimeRemaining = (startTime: string) => {
        const diff = new Date(startTime).getTime() - new Date().getTime();
        if (diff < 0) return "Starting Now";
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        if (days > 0) return `Starts in ${days}d`;
        if (hours > 0) return `Starts in ${hours}h`;
        return "Starts soon";
    };

    useEffect(() => {
        setTempEmail(state.notificationSettings.operatorEmail || user?.email || '');
    }, [state.notificationSettings.operatorEmail, user?.email]);

    useEffect(() => {
      const interval = setInterval(async () => {
        if (!isLoaded) return;
        const { notifiedTasks, logs } = await notificationService.current.checkDeadlines(state.tasks, state.notificationSettings);
        if (notifiedTasks.length > 0) {
          setState(prev => {
            const updatedTasks = prev.tasks.map(t => {
              const notification = notifiedTasks.find(nt => nt.id === t.id);
              if (notification) {
                return { 
                  ...t, 
                  lastNotified: new Date().toISOString(),
                  lastNotifiedMilestone: notification.milestone
                };
              }
              return t;
            });
            return {
              ...prev,
              notificationLogs: [...logs, ...prev.notificationLogs].slice(0, 50),
              tasks: updatedTasks
            } as DashboardState;
          });
        }
      }, 1000 * 60 * 5); // Check every 5 mins
      return () => clearInterval(interval);
    }, [state.tasks, state.notificationSettings, isLoaded]);

    useEffect(() => {
        voiceService.current = new GeminiVoiceService();
        return () => voiceService.current?.stop();
    }, []);

    const handleUnlockEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setUnlockError(null);
        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: user?.email || '',
                password: unlockPassword
            });
            if (error) throw new Error("Incorrect password");
            setIsEmailLocked(false);
            setShowUnlockModal(false);
            setUnlockPassword('');
        } catch (err: any) {
            setUnlockError(err.message);
        }
    };

    const saveSettings = () => {
        setState(prev => ({
            ...prev,
            notificationSettings: {
                ...prev.notificationSettings,
                operatorEmail: tempEmail
            }
        }));
        setIsEmailLocked(true);
        setShowSettings(false);
    };

    const sendTestEmail = async () => {
        if (!tempEmail) return;
        setIsTestingEmail(true);
        try {
            const body = await notificationService.current.dispatchTestEmail(tempEmail);
            setState(prev => ({
                ...prev,
                notificationLogs: [{
                    id: Date.now().toString(),
                    timestamp: new Date().toISOString(),
                    type: 'Email' as const,
                    title: 'Test Email',
                    content: body,
                    status: 'Dispatched' as const
                }, ...prev.notificationLogs].slice(0, 50)
            } as DashboardState));
        } catch (e) {
            console.error("Email test failed", e);
        } finally {
            setIsTestingEmail(false);
        }
    };

    const addTask = useCallback((title: string, priority: PriorityLevel, target: TaskType = 'Daily', startTime: string, endTime: string, isRecurring: boolean = false) => {
        const now = Date.now();
        const newTask: Task = {
            id: now.toString(),
            title,
            startTime: startTime || new Date(now).toISOString(),
            endTime: endTime || new Date(now + 3600000).toISOString(),
            priority,
            completed: false,
            type: target,
            recurring: isRecurring,
            lastNotifiedMilestone: null
        };
        setState(prev => ({ ...prev, tasks: [newTask, ...prev.tasks] }));
        setShowAddModal(null);
    }, []);

    const addExpense = useCallback((label: string, amount: number, category: ExpenseCategory) => {
        const newExpense: Expense = {
            id: Date.now().toString(),
            label,
            amount,
            category,
            date: new Date().toISOString()
        };
        setState(prev => ({ ...prev, expenses: [newExpense, ...prev.expenses] }));
        setShowAddModal(null);
    }, []);

    const toggleMic = async () => {
        if (isListening) {
            voiceService.current?.stop();
            setIsListening(false);
        } else {
            try {
                setIsListening(true);
                await voiceService.current?.start(state, {
                    onAddTask: (title, priority, target, start, end) => addTask(title, priority, target, start || "", end || ""),
                    onAddExpense: (label, amount, category) => addExpense(label, amount, category),
                });
            } catch (err: any) {
                setIsListening(false);
            }
        }
    };

    const totalSpent = state.expenses.reduce((acc, curr) => acc + curr.amount, 0);

    const renderContent = () => {
        switch (activeTab) {
            case 'search':
                return (
                    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="relative mb-8">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400" size={18} />
                            <input autoFocus type="text" placeholder="Search tasks..." className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-cyan-400/50 transition-all placeholder:text-white/20" />
                        </div>
                    </section>
                );
            case 'notifications':
                return (
                    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex justify-between items-center mb-6">
                          <h2 className="text-[11px] font-bold tracking-[0.2em] text-white/40 uppercase">Notifications</h2>
                          <button onClick={() => setState(s => ({...s, notificationLogs: []}))} className="text-[9px] text-cyan-400/40 hover:text-cyan-400 uppercase font-bold tracking-widest transition-colors">Clear History</button>
                        </div>
                        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                            {state.notificationLogs.length === 0 ? (
                                <div className="h-40 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-2xl opacity-10">
                                    <Bell size={24} className="mb-2" />
                                    <span className="text-[8px] font-bold uppercase tracking-widest">No Recent Alerts</span>
                                </div>
                            ) : (
                                state.notificationLogs.map(log => (
                                    <GlassCard key={log.id} className="p-4 border-l-2 border-l-cyan-400/50 hover:bg-white/[0.08]">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-white uppercase tracking-widest">{log.title}</span>
                                            </div>
                                            <span className="text-[8px] font-mono text-white/30">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                        <div className="text-[9px] leading-relaxed text-white/50 font-mono mt-3 p-3 bg-black/40 rounded-xl border border-white/5 shadow-inner">
                                            {log.content}
                                        </div>
                                    </GlassCard>
                                ))
                            )}
                        </div>
                    </section>
                );
            default:
                return (
                    <div className="space-y-8 animate-in fade-in duration-700">
                        {/* Info Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <GlassCard className="flex flex-col justify-between h-32 border-cyan-400/10 group">
                                <span className="text-[9px] font-bold text-white/30 tracking-[0.1em] uppercase">Next Task</span>
                                {nextTask ? (
                                    <>
                                        <h2 className="text-sm font-bold text-white line-clamp-2 leading-tight group-hover:text-cyan-400 transition-colors">{nextTask.title}</h2>
                                        <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 font-bold uppercase tracking-widest">
                                            <Clock size={10} />
                                            {getTimeRemaining(nextTask.startTime)}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <h2 className="text-sm font-bold text-white/20 italic">No Tasks</h2>
                                        <p className="text-[9px] text-cyan-400/30 font-bold uppercase tracking-widest">Ready to go</p>
                                    </>
                                )}
                            </GlassCard>

                            <GlassCard className="flex flex-col justify-between h-32">
                                <span className="text-[9px] font-bold text-white/30 tracking-[0.1em] uppercase">Daily Progress</span>
                                <h2 className="text-2xl font-bold text-white tabular-nums">
                                    {state.tasks.filter(t => t.type === 'Daily' && t.completed).length}<span className="text-white/20 mx-1">/</span>{state.tasks.filter(t => t.type === 'Daily').length}
                                </h2>
                                <p className="text-[9px] text-cyan-400/40 font-bold uppercase tracking-widest">Completed</p>
                            </GlassCard>

                            <GlassCard className="hidden md:flex flex-col justify-between h-32 border-white/5">
                                <span className="text-[9px] font-bold text-white/30 tracking-[0.1em] uppercase">Alert Status</span>
                                <div className="flex items-center gap-3">
                                  <h2 className="text-xl font-bold text-white tracking-widest">{state.notificationSettings.emailEnabled ? 'ENABLED' : 'DISABLED'}</h2>
                                  <Shield size={16} className={state.notificationSettings.emailEnabled ? 'text-cyan-400' : 'text-white/10'} />
                                </div>
                                <p className="text-[9px] text-cyan-400/40 font-bold uppercase tracking-widest">Email Alerts</p>
                            </GlassCard>
                        </div>

                        {/* Smart Advice Section */}
                        <GlassCard className="border-cyan-400/20 bg-cyan-400/5">
                            <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={16} className="text-cyan-400" />
                                    <span className="text-[10px] font-bold text-white/60 tracking-widest uppercase">Smart Advice</span>
                                </div>
                                <button 
                                    onClick={getAiInsight} 
                                    disabled={isInsightLoading}
                                    className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest hover:text-cyan-300 disabled:opacity-50 transition-colors"
                                >
                                    {isInsightLoading ? 'Analyzing...' : 'Refresh'}
                                </button>
                            </div>
                            <p className="text-sm text-white/80 leading-relaxed font-medium min-h-[1.25rem]">
                                {aiInsight || "Click refresh for personalized insight on your day."}
                            </p>
                        </GlassCard>

                        {/* Task Section */}
                        <section>
                            <div className="flex flex-col gap-4 mb-6">
                                <div className="flex justify-between items-center">
                                    <div className="flex gap-4">
                                        <button onClick={() => setTaskTab('Daily')} className={`text-[11px] font-bold tracking-widest uppercase transition-all pb-1 border-b ${taskTab === 'Daily' ? 'text-cyan-400 border-cyan-400' : 'text-white/20 border-transparent hover:text-white/40'}`}>Daily</button>
                                        <button onClick={() => setTaskTab('Main')} className={`text-[11px] font-bold tracking-widest uppercase transition-all pb-1 border-b ${taskTab === 'Main' ? 'text-cyan-400 border-cyan-400' : 'text-white/20 border-transparent hover:text-white/40'}`}>All Tasks</button>
                                    </div>
                                    <div className="flex gap-2.5">
                                        <button onClick={() => setShowAddModal('task')} className="text-cyan-400 p-2.5 bg-cyan-400/5 backdrop-blur-xl border border-cyan-400/20 rounded-xl hover:bg-cyan-400/15 transition-all active:scale-90 shadow-lg"><Plus size={18} /></button>
                                    </div>
                                </div>

                                {/* Filter Controls */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-2xl">
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[7px] font-bold uppercase text-white/30 tracking-widest ml-1">Filter by Priority</span>
                                        <div className="flex gap-1.5 p-1 bg-black/30 rounded-xl border border-white/5">
                                            {['All', 'Critical', 'Standard', 'Low'].map(p => (
                                                <button 
                                                    key={p} 
                                                    onClick={() => setPriorityFilter(p as any)}
                                                    className={`flex-1 px-2 py-1.5 rounded-lg text-[8px] font-bold uppercase transition-all duration-300 border ${priorityFilter === p ? 'bg-cyan-400/10 border-cyan-400/50 text-cyan-400' : 'border-transparent text-white/20 hover:text-white/40'}`}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[7px] font-bold uppercase text-white/30 tracking-widest ml-1">Filter by Status</span>
                                        <div className="flex gap-1.5 p-1 bg-black/30 rounded-xl border border-white/5">
                                            {['All', 'Pending', 'Done'].map(s => {
                                                const val = s === 'Done' ? 'Completed' : s;
                                                return (
                                                    <button 
                                                        key={s} 
                                                        onClick={() => setStatusFilter(val as any)}
                                                        className={`flex-1 px-2 py-1.5 rounded-lg text-[8px] font-bold uppercase transition-all duration-300 border ${statusFilter === val ? 'bg-cyan-400/10 border-cyan-400/50 text-cyan-400' : 'border-transparent text-white/20 hover:text-white/40'}`}
                                                    >
                                                        {s}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {filteredTasks.length === 0 ? (
                                    <div className="py-16 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-3xl opacity-10">
                                        <ClipboardList size={40} className="mb-3" />
                                        <p className="text-[9px] uppercase font-bold tracking-widest">No tasks found</p>
                                    </div>
                                ) : (
                                    filteredTasks.map(task => (
                                        <GlassCard key={task.id} className="group py-5 px-6 flex items-center gap-6 border-white/5 hover:border-cyan-400/20">
                                            <button onClick={() => setState(s => ({ ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed, lastCompletedDate: !t.completed ? new Date().toISOString().split('T')[0] : undefined } : t) }))} className="transition-all active:scale-90">
                                                {task.completed ? <CheckCircle2 size={24} className="text-green-400" /> : <Circle size={24} className="text-white/10 hover:text-cyan-400 transition-colors" />}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <h4 className={`text-base font-bold tracking-wide transition-all ${task.completed ? 'text-white/10 line-through' : 'text-white'}`}>{task.title}</h4>
                                                <div className="flex flex-wrap items-center gap-3 mt-2">
                                                    <span className="text-[8px] font-bold uppercase px-2.5 py-1 rounded-lg border border-white/10 bg-white/5" style={{ color: (PRIORITY_COLORS as any)[task.priority] }}>{task.priority}</span>
                                                    {task.recurring && <span className="text-[8px] text-green-400/50 uppercase font-mono tracking-widest border border-green-400/10 px-2 py-1 rounded-lg bg-green-400/5">Recurring</span>}
                                                    <span className="text-[8px] text-white/30 font-mono flex items-center gap-1.5"><Clock size={11} className="text-cyan-400/30" /> {formatTimeRange(task.startTime, task.endTime)}</span>
                                                </div>
                                            </div>
                                            <button onClick={() => setState(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== task.id) }))} className="p-2 text-red-500/30 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/10 hover:text-red-500 rounded-xl"><Trash2 size={18} /></button>
                                        </GlassCard>
                                    ))
                                )}
                            </div>
                        </section>

                        {/* Budget Management */}
                        <section className="space-y-5">
                            <div className="flex justify-between items-center px-1">
                                <h2 className="text-[11px] font-bold tracking-[0.2em] text-white/40 uppercase">Finance Overview</h2>
                                <button onClick={() => setShowAddModal('expense')} className="text-cyan-400 p-2 bg-cyan-400/5 border border-cyan-400/20 backdrop-blur-xl rounded-xl hover:bg-cyan-400/15 transition-all shadow-md active:scale-90"><Plus size={16} /></button>
                            </div>

                            <FinanceOverview items={[
                              { icon: 'DollarSign', label: 'SPENT', val: `$${totalSpent.toLocaleString()}` },
                              { icon: 'CreditCard', label: 'BUDGET', val: `$${state.budgetConfig.limit.toLocaleString()}` },
                              { icon: 'TrendingDown', label: 'LEFT', val: `$${Math.max(0, state.budgetConfig.limit - totalSpent).toLocaleString()}` }
                            ]} />
                        </section>
                    </div>
                );
        }
    };

    if (!isLoaded) return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-cyan-400 mb-6" size={48} />
            <div className="text-[10px] tracking-[0.4em] font-bold text-white/20 animate-pulse uppercase">Loading your dashboard...</div>
        </div>
    );

    return (
        <div className="min-h-screen relative pb-32">
            <div className="fixed top-0 left-0 w-full h-full bg-[#050505] -z-10" />
            
            {/* Unlock Password Modal */}
            {showUnlockModal && (
              <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/95 backdrop-blur-3xl animate-in fade-in duration-500">
                <GlassCard className="w-full max-sm p-10 border-cyan-500/40">
                  <div className="flex flex-col items-center mb-8">
                    <Shield className="text-cyan-400 mb-6" size={40} />
                    <h2 className="text-xl font-bold text-white uppercase tracking-widest">Security Check</h2>
                    <p className="text-[10px] text-white/30 uppercase mt-3 tracking-widest">Verify password to edit settings</p>
                  </div>
                  <form onSubmit={handleUnlockEmail} className="space-y-5">
                    <input autoFocus type="password" value={unlockPassword} onChange={(e) => setUnlockPassword(e.target.value)} placeholder="ENTER PASSWORD..." className="w-full bg-white/5 backdrop-blur-xl border border-white/10 p-5 rounded-2xl text-white text-sm outline-none focus:border-cyan-400/50 transition-all" />
                    {unlockError && <p className="text-[10px] text-red-500 font-bold uppercase text-center">{unlockError}</p>}
                    <div className="flex gap-4 pt-2">
                      <button type="button" onClick={() => setShowUnlockModal(false)} className="flex-1 py-4 text-white/30 text-[10px] font-bold uppercase tracking-widest hover:text-white">Cancel</button>
                      <button type="submit" className="flex-1 py-4 bg-cyan-400 text-black text-[10px] font-bold rounded-2xl uppercase tracking-widest shadow-lg hover:bg-cyan-300">Verify</button>
                    </div>
                  </form>
                </GlassCard>
              </div>
            )}

            {showSettings && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-500">
                    <GlassCard className="w-full max-lg p-10 relative max-h-[90vh] overflow-y-auto border-cyan-400/20 shadow-2xl">
                        <button onClick={() => setShowSettings(false)} className="absolute top-6 right-6 text-white/20 hover:text-white transition-all"><X size={28} /></button>
                        <h2 className="text-2xl font-bold text-white mb-10 uppercase tracking-widest">Settings</h2>
                        
                        <div className="space-y-8 mb-10">
                            <div className="p-6 bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-3xl space-y-6">
                                <div className="flex justify-between items-center">
                                  <div className="flex flex-col">
                                    <span className="text-[11px] text-white font-bold uppercase tracking-widest">Email Notifications</span>
                                    <span className="text-[8px] text-white/30 uppercase tracking-widest mt-1">Get alerts for upcoming tasks</span>
                                  </div>
                                  <button onClick={() => setState(prev => ({ ...prev, notificationSettings: { ...prev.notificationSettings, emailEnabled: !prev.notificationSettings.emailEnabled } }))} className={`w-12 h-6 rounded-full transition-all relative p-1 ${state.notificationSettings.emailEnabled ? 'bg-cyan-400' : 'bg-white/10'}`}>
                                    <div className={`w-4 h-4 rounded-full bg-white transition-all shadow-md ${state.notificationSettings.emailEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                  </button>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[8px] font-bold text-white/30 uppercase tracking-widest flex items-center justify-between ml-1">
                                        Email Address
                                        <div className="flex items-center gap-1.5">
                                            {isEmailLocked ? <Lock size={9} className="text-white/20" /> : <Unlock size={9} className="text-cyan-400" />}
                                        </div>
                                    </label>
                                    <div className="flex gap-3">
                                        <input 
                                            disabled={isEmailLocked} 
                                            type="email" 
                                            value={tempEmail} 
                                            onChange={(e) => setTempEmail(e.target.value)} 
                                            placeholder="ENTER EMAIL ADDRESS..." 
                                            className={`flex-1 bg-black/40 backdrop-blur-xl border border-white/10 p-4 rounded-2xl text-white text-xs outline-none transition-all placeholder:text-white/10 ${isEmailLocked ? 'opacity-40' : 'focus:border-cyan-400/50'}`} 
                                        />
                                        {isEmailLocked ? (
                                            <button onClick={() => setShowUnlockModal(true)} className="px-5 py-2 bg-white/5 border border-white/10 rounded-2xl text-[9px] font-bold uppercase tracking-widest hover:bg-white/10 text-cyan-400 transition-all">Unlock</button>
                                        ) : (
                                            <button onClick={sendTestEmail} disabled={isTestingEmail} className="px-5 py-2 bg-cyan-400/10 text-cyan-400 border border-cyan-400/30 rounded-2xl text-[9px] font-bold uppercase tracking-widest hover:bg-cyan-400/20 disabled:opacity-50 transition-all">
                                                {isTestingEmail ? <Loader2 className="animate-spin" size={14} /> : 'Test'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 bg-white/[0.03] backdrop-blur-3xl border border-white/10 rounded-3xl space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[8px] font-bold text-white/30 uppercase tracking-widest ml-1">Monthly Budget ($)</label>
                                    <input type="number" value={state.budgetConfig.limit} onChange={(e) => setState(prev => ({ ...prev, budgetConfig: { limit: parseInt(e.target.value) || 0 } }))} className="w-full bg-black/40 backdrop-blur-xl border border-white/10 p-4 rounded-2xl text-white text-xs focus:border-cyan-400/50 outline-none transition-all tabular-nums" />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={saveSettings} className="py-5 bg-cyan-400 text-black font-bold text-xs tracking-widest uppercase rounded-2xl flex items-center justify-center gap-3 hover:bg-cyan-300 transition-all active:scale-95"><Check size={18} /> Save Changes</button>
                            <button onClick={signOut} className="py-5 bg-white/5 border border-white/10 rounded-2xl text-white/40 font-bold text-xs tracking-widest uppercase hover:text-red-500 transition-all flex items-center justify-center gap-3"><LogOut size={18} /> Sign Out</button>
                        </div>
                    </GlassCard>
                </div>
            )}

            {showAddModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/95 backdrop-blur-3xl animate-in zoom-in-95 duration-300">
                    <GlassCard className="w-full max-sm p-10 border-cyan-400/30">
                        <h2 className="text-xl font-bold text-white mb-8 uppercase tracking-widest">{showAddModal === 'task' ? 'Add Task' : 'Add Expense'}</h2>
                        
                        {showAddModal === 'task' ? (
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                addTask(
                                    formData.get('title') as string, 
                                    formData.get('priority') as PriorityLevel, 
                                    formData.get('target') as TaskType, 
                                    formData.get('startTime') as string,
                                    formData.get('endTime') as string,
                                    formData.get('recurring') === 'on'
                                );
                            }} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[7px] font-bold text-white/30 uppercase tracking-widest ml-1">Task Name</label>
                                    <input required name="title" placeholder="ENTER TASK TITLE..." className="w-full bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl text-white text-sm focus:border-cyan-400/50 outline-none transition-all font-bold" />
                                </div>
                                
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[7px] font-bold text-white/30 uppercase tracking-widest ml-1">Priority</label>
                                        <div className="relative">
                                            <select name="priority" className="w-full bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl text-white text-[10px] font-bold uppercase outline-none appearance-none hover:border-white/20 transition-all">
                                                <option value="Critical" className="bg-[#050505]">CRITICAL</option>
                                                <option value="Standard" className="bg-[#050505]">STANDARD</option>
                                                <option value="Low" className="bg-[#050505]">LOW</option>
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-cyan-400/40 text-[8px]">▼</div>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[7px] font-bold text-white/30 uppercase tracking-widest ml-1">Category</label>
                                        <div className="relative">
                                            <select name="target" className="w-full bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl text-white text-[10px] font-bold uppercase outline-none appearance-none hover:border-white/20 transition-all">
                                                <option value="Daily" className="bg-[#050505]">DAILY</option>
                                                <option value="Main" className="bg-[#050505]">TASKS</option>
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-cyan-400/40 text-[8px]">▼</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[7px] font-bold text-cyan-400/60 uppercase tracking-widest ml-1">Start Time</label>
                                        <input required name="startTime" type="datetime-local" className="w-full bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl text-white text-[10px] focus:border-cyan-400/50 outline-none transition-all" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[7px] font-bold text-red-400/60 uppercase tracking-widest ml-1">End Time</label>
                                        <input required name="endTime" type="datetime-local" className="w-full bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl text-white text-[10px] focus:border-cyan-400/50 outline-none transition-all" />
                                    </div>
                                </div>

                                <label className="flex items-center gap-3 px-2 group cursor-pointer py-2">
                                    <input name="recurring" type="checkbox" className="w-5 h-5 rounded-lg bg-white/5 border-white/20 text-cyan-400 focus:ring-cyan-400/20" />
                                    <span className="text-[9px] text-white/30 group-hover:text-white/70 font-bold uppercase tracking-widest">Repeat Daily</span>
                                </label>

                                <div className="flex gap-4 pt-6 border-t border-white/5">
                                    <button type="button" onClick={() => setShowAddModal(null)} className="flex-1 py-4 text-white/20 text-[10px] font-bold uppercase tracking-widest hover:text-white">Cancel</button>
                                    <button type="submit" className="flex-1 py-4 bg-cyan-400 text-black font-bold text-[10px] rounded-2xl uppercase tracking-widest shadow-lg hover:bg-cyan-300 transition-all">Add Task</button>
                                </div>
                            </form>
                        ) : (
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                addExpense(formData.get('label') as string, parseFloat(formData.get('amount') as string) || 0, formData.get('category') as ExpenseCategory);
                            }} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[7px] font-bold text-white/30 uppercase tracking-widest ml-1">Description</label>
                                    <input required name="label" placeholder="ENTER EXPENSE NAME..." className="w-full bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl text-white text-sm focus:border-cyan-400/50 outline-none transition-all font-bold" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[7px] font-bold text-white/30 uppercase tracking-widest ml-1">Amount ($)</label>
                                        <input required type="number" step="0.01" name="amount" placeholder="0.00" className="w-full bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl text-white text-sm focus:border-cyan-400/50 outline-none transition-all font-mono" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[7px] font-bold text-white/30 uppercase tracking-widest ml-1">Type</label>
                                        <div className="relative">
                                            <select name="category" className="w-full bg-white/5 backdrop-blur-xl border border-white/10 p-4 rounded-2xl text-white text-[10px] font-bold uppercase outline-none appearance-none hover:border-white/20 transition-all">
                                                <option value="Other" className="bg-[#050505]">OTHER</option>
                                                <option value="Food" className="bg-[#050505]">FOOD</option>
                                                <option value="Rent" className="bg-[#050505]">RENT</option>
                                                <option value="Travel" className="bg-[#050505]">TRAVEL</option>
                                                <option value="Health" className="bg-[#050505]">HEALTH</option>
                                                <option value="Tech" className="bg-[#050505]">TECH</option>
                                            </select>
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-cyan-400/40 text-[8px]">▼</div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-4 pt-6 border-t border-white/5">
                                    <button type="button" onClick={() => setShowAddModal(null)} className="flex-1 py-4 text-white/20 text-[10px] font-bold uppercase tracking-widest hover:text-white">Cancel</button>
                                    <button type="submit" className="flex-1 py-4 bg-cyan-400 text-black font-bold text-[10px] rounded-2xl uppercase tracking-widest shadow-lg hover:bg-cyan-300 transition-all">Add Expense</button>
                                </div>
                            </form>
                        )}
                    </GlassCard>
                </div>
            )}

            <main className="max-w-2xl mx-auto px-6 pt-10">
                <header className="flex justify-between items-start mb-12">
                    <div className="animate-in fade-in slide-in-from-left duration-700">
                        <h1 className="text-3xl font-extralight text-white leading-tight">Welcome back.</h1>
                    </div>
                    <button onClick={() => setShowSettings(true)} className="w-12 h-12 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-cyan-400 hover:text-cyan-300 hover:border-cyan-400/50 transition-all shadow-xl active:scale-90">
                        <Settings size={22} />
                    </button>
                </header>

                <section className="flex flex-col items-center justify-center h-56 mb-12 relative">
                    <div className="absolute inset-0 bg-cyan-400/5 blur-[120px] rounded-full pointer-events-none animate-pulse"></div>
                    <JarvisOrb isListening={isListening} />
                </section>
                {renderContent()}
            </main>

            <NavigationBar onMicClick={toggleMic} isListening={isListening} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>
    );
};

const AppContent: React.FC = () => {
    const { user, loading } = useAuth();
    if (loading) return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-cyan-400 mb-6" size={48} />
            <div className="text-cyan-400 font-mono text-[10px] tracking-[0.5em] animate-pulse uppercase">Synchronizing Account...</div>
        </div>
    );
    return user ? <Dashboard /> : <Login />;
};

const App: React.FC = () => {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
};

export default App;