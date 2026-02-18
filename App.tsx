
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Settings, X, Plus, Trash2, CheckCircle2, 
  Circle, Activity, Search, Bell, Shield, User, LogOut, Lock, Unlock, Loader2, BarChart2, ClipboardList, Mail, Send, DollarSign, CreditCard, TrendingDown, Edit2, Clock, Filter, Check, Cloud, Sparkles, Zap, Trophy, Target, PieChart, AlertTriangle, RefreshCcw, FileText
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { INITIAL_STATE, PRIORITY_COLORS } from './constants.tsx';
import { DashboardState, Task, Expense, PriorityLevel, ExpenseCategory, TaskType, PerformanceReport, NotificationSettings, NotificationLog, ChatSession, Message } from './types.ts';
import JarvisOrb from './components/JarvisOrb.tsx';
import NavigationBar, { TabType } from './components/NavigationBar.tsx';
import GlassCard from './components/GlassCard.tsx';
import FinanceOverview from './components/FinanceOverview.tsx';
import ChatInterface from './components/ChatInterface.tsx';
import CalendarView from './components/CalendarView.tsx';
import { GeminiVoiceService } from './services/geminiLive.ts';
import { NotificationService } from './services/notificationService.ts';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';
import Login from './components/Login.tsx';
import { supabase } from './lib/supabaseClient.ts';

const Dashboard: React.FC = () => {
    const { user, signOut } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('home');
    const [taskTab, setTaskTab] = useState<TaskType>('Daily');
    
    // Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [settingsTab, setSettingsTab] = useState<'general' | 'notifications'>('general');

    const [showAddModal, setShowAddModal] = useState<'task' | 'expense' | null>(null);
    const [performanceReport, setPerformanceReport] = useState<PerformanceReport | null>(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [aiInsight, setAiInsight] = useState<string | null>(null);
    const [isInsightLoading, setIsInsightLoading] = useState(false);
    
    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchStatusFilter, setSearchStatusFilter] = useState<'All' | 'Pending' | 'Completed'>('All');

    // Chat Session Management
    const [chatSessions, setChatSessions] = useState<ChatSession[]>([
        { id: 'default', title: 'New Conversation', messages: [], createdAt: new Date().toISOString() }
    ]);
    const [activeSessionId, setActiveSessionId] = useState<string>('default');

    // Filtering State
    const [priorityFilter, setPriorityFilter] = useState<'All' | PriorityLevel>('All');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Completed'>('All');

    // Voice & Diagnostic State
    const [isListening, setIsListening] = useState(false);
    const [voiceError, setVoiceError] = useState<string | null>(null);

    // Email Security State
    const [isEmailLocked, setIsEmailLocked] = useState(true);
    const [showUnlockModal, setShowUnlockModal] = useState(false);
    const [unlockPassword, setUnlockPassword] = useState('');
    const [unlockError, setUnlockError] = useState<string | null>(null);
    const [tempEmail, setTempEmail] = useState('');
    const [isTestingEmail, setIsTestingEmail] = useState(false);
    
    // Internal state management
    const [state, setState] = useState<DashboardState>(INITIAL_STATE);
    const [isLoaded, setIsLoaded] = useState(false);

    // Refs for real-time data access during voice command chains
    const tasksRef = useRef<Task[]>([]);
    const expensesRef = useRef<Expense[]>([]);

    const voiceService = useRef<GeminiVoiceService | null>(null);
    const notificationService = useRef<NotificationService>(new NotificationService());

    // Sync refs with state whenever state updates or loads
    useEffect(() => {
        tasksRef.current = state.tasks;
    }, [state.tasks]);

    useEffect(() => {
        expensesRef.current = state.expenses;
    }, [state.expenses]);

    // Initial Load: Local -> Cloud
    useEffect(() => {
        const loadPersistence = async () => {
            if (!user) return;
            
            try {
                const storageKey = `arkos_db_${user.id}`;
                const localSaved = localStorage.getItem(storageKey);
                const cloudSaved = user.user_metadata?.arkos_state;
                
                let finalState = INITIAL_STATE;
                
                if (cloudSaved && typeof cloudSaved === 'object') {
                    finalState = cloudSaved;
                } else if (localSaved) {
                    try {
                        finalState = JSON.parse(localSaved);
                    } catch (e) {
                        console.error("Local load failed", e);
                    }
                }

                const loadedState = {
                    ...INITIAL_STATE,
                    ...finalState,
                    tasks: Array.isArray(finalState.tasks) ? finalState.tasks : [],
                    expenses: Array.isArray(finalState.expenses) ? finalState.expenses : [],
                    notificationLogs: Array.isArray(finalState.notificationLogs) ? finalState.notificationLogs : []
                };

                setState(loadedState);
                
                // Initialize refs immediately upon load
                tasksRef.current = loadedState.tasks;
                expensesRef.current = loadedState.expenses;
            } catch (err) {
                console.error("Critical State Load Error", err);
                // Fallback to initial state is already set by useState
            } finally {
                setIsLoaded(true);
            }
        };
        loadPersistence();
    }, [user]);

    // Debounced Sync to Supabase & LocalStorage
    useEffect(() => {
        if (!isLoaded || !user) return;

        const syncData = async () => {
            setIsSyncing(true);
            const storageKey = `arkos_db_${user.id}`;
            try {
                localStorage.setItem(storageKey, JSON.stringify(state));
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
                model: 'gemini-3-flash-preview',
                contents: `Analyze my current state and give me one helpful sentence of advice. 
                Tasks: ${taskData}. 
                Budget: ${budgetData}. 
                Be friendly and conversational.`,
                config: { temperature: 0.7 }
            });
            setAiInsight(response.text || "You're doing great! Keep it up.");
        } catch (err) {
            console.error(err);
        } finally {
            setIsInsightLoading(false);
        }
    };

    const generatePerformanceReport = async () => {
      setIsGeneratingReport(true);
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      try {
        // Use Refs to ensure we capture tasks/expenses added milliseconds ago in the same voice turn
        const currentTasks = tasksRef.current;
        const currentExpenses = expensesRef.current;
        
        const dailyTasks = currentTasks.filter(t => t.type === 'Daily');
        const completedTasks = dailyTasks.filter(t => t.completed);
        const completedCount = completedTasks.length;
        const total = dailyTasks.length;
        const spent = currentExpenses.reduce((a, b) => a + b.amount, 0);
        const budget = state.budgetConfig.limit;
        
        const completedTitles = completedTasks.map(t => t.title).join(', ');

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: `Act as a helpful personal assistant. 
          Generate a daily summary report based on the following data.
          
          DATA:
          - Completed Tasks: ${completedTitles || "None"}
          - Progress: ${completedCount}/${total} tasks
          - Spending: $${spent} / Budget: $${budget}
          
          INSTRUCTIONS:
          1. Provide a 'Score' (0-100) based on productivity and budget.
          2. Write a summary of what was done today.
          3. Add a helpful insight for tomorrow.
          
          FORMATTING RULES:
          - STRICTLY NO HASHTAGS (#). Do not use markdown headers.
          - Use simple bullet points (•) for the summary list.
          - Keep the language simple, friendly, and easy to read for a non-technical person.
          - Do not use bold (**) or italics (*). Just plain text.
          - Structure it clearly with line breaks.`,
          config: { temperature: 0.5 }
        });

        const scoreMatch = response.text?.match(/(\d+)\/100/);
        const calculatedScore = total > 0 ? Math.round((completedCount / total) * 100) : 0;
        const score = scoreMatch ? parseInt(scoreMatch[1]) : calculatedScore;

        setPerformanceReport({
          summary: response.text || "Performance analysis complete.",
          score: Math.min(100, Math.max(0, score)),
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        console.error("Report generation failed", err);
      } finally {
        setIsGeneratingReport(false);
      }
    };

    const addTask = useCallback((title: string, priority: PriorityLevel, target: TaskType = 'Daily', completed: boolean = false, startTime: string, endTime: string, isRecurring: boolean = false) => {
        const now = Date.now();
        const newTask: Task = {
            id: now.toString(),
            title,
            startTime: startTime || new Date(now).toISOString(),
            endTime: endTime || new Date(now + 3600000).toISOString(),
            priority,
            completed: completed,
            type: target,
            recurring: isRecurring,
            lastNotifiedMilestone: null,
            lastCompletedDate: completed ? new Date().toISOString().split('T')[0] : undefined
        };
        
        // Optimistically update ref so subsequent sync calls (like generateReport) see it immediately
        tasksRef.current = [newTask, ...tasksRef.current];
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
        
        // Optimistically update ref
        expensesRef.current = [newExpense, ...expensesRef.current];
        setState(prev => ({ ...prev, expenses: [newExpense, ...prev.expenses] }));
        setShowAddModal(null);
    }, []);

    // Session Management Functions
    const createNewSession = () => {
        const newSession: ChatSession = {
            id: Date.now().toString(),
            title: 'New Conversation',
            messages: [],
            createdAt: new Date().toISOString()
        };
        setChatSessions(prev => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
    };

    const deleteSession = (sessionId: string) => {
        const updatedSessions = chatSessions.filter(s => s.id !== sessionId);
        
        if (updatedSessions.length === 0) {
            // Reset to clean state if user deletes the last session
            const newSession = { id: Date.now().toString(), title: 'New Conversation', messages: [], createdAt: new Date().toISOString() };
            setChatSessions([newSession]);
            setActiveSessionId(newSession.id);
        } else {
            setChatSessions(updatedSessions);
            // If the deleted session was the active one, switch to the first available one
            if (activeSessionId === sessionId) {
                setActiveSessionId(updatedSessions[0].id);
            }
        }
    };

    const updateSessionMessages = (messages: Message[]) => {
        setChatSessions(prev => prev.map(session => {
            if (session.id === activeSessionId) {
                // Auto-generate title from first user message if it's "New Conversation"
                let title = session.title;
                if (session.messages.length === 0 && messages.length > 0 && messages[0].role === 'user') {
                    title = messages[0].text.slice(0, 30) + (messages[0].text.length > 30 ? '...' : '');
                }
                return { ...session, title, messages };
            }
            return session;
        }));
    };

    const resetDailyTasks = () => {
        if (window.confirm("Start a new day? This will reset all daily tasks to pending.")) {
             setState(prev => ({
                ...prev,
                tasks: prev.tasks.map(t => 
                    t.type === 'Daily' ? { ...t, completed: false, lastCompletedDate: undefined } : t
                )
            }));
        }
    };

    const toggleMic = async () => {
        if (isListening) {
            voiceService.current?.stop();
            setIsListening(false);
        } else {
            setVoiceError(null);
            try {
                setIsListening(true);
                await voiceService.current?.start(state, {
                    onAddTask: (title, p, t, completed, start, end) => addTask(title, p, t, completed, start || "", end || ""),
                    onAddExpense: (label, amount, category) => addExpense(label, amount, category),
                    onGenerateReport: () => generatePerformanceReport(),
                    onTranscript: (role, text) => {
                        // Add voice transcripts to the ACTIVE session
                        setChatSessions(prev => prev.map(session => {
                            if (session.id === activeSessionId) {
                                return {
                                    ...session,
                                    messages: [...session.messages, {
                                        id: Date.now().toString() + Math.random(),
                                        role: role,
                                        text: text,
                                        timestamp: new Date()
                                    }]
                                };
                            }
                            return session;
                        }));
                    },
                    onError: (msg) => {
                        setVoiceError(msg);
                        setIsListening(false);
                    },
                    onDisconnect: () => {
                        setIsListening(false);
                    }
                });
            } catch (err: any) {
                setIsListening(false);
                setVoiceError(err.message || "Voice system initialization failed.");
            }
        }
    };

    // Task Filtering Logic for Main View
    const filteredTasks = useMemo(() => {
        const todayStr = new Date().toISOString().split('T')[0];
        
        return state.tasks.filter(t => {
            const matchesType = t.type === taskTab;
            const matchesPriority = priorityFilter === 'All' || t.priority === priorityFilter;
            const matchesStatus = statusFilter === 'All' || 
                (statusFilter === 'Pending' && !t.completed) || 
                (statusFilter === 'Completed' && t.completed);
            
            // FRESH START LOGIC: 
            // If a task is completed, it must have been completed TODAY to show up in the main list.
            // Old completed tasks are hidden (but visible in Calendar view).
            let matchesDate = true;
            if (t.completed) {
                // Determine completion date or fallback to start time if missing
                const completedDate = t.lastCompletedDate || t.startTime.split('T')[0];
                if (completedDate !== todayStr) {
                    matchesDate = false;
                }
            }

            return matchesType && matchesPriority && matchesStatus && matchesDate;
        });
    }, [state.tasks, taskTab, priorityFilter, statusFilter]);
    
    // Search Filtering Logic
    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const lowerQuery = searchQuery.toLowerCase();
        
        let results = state.tasks.filter(t => 
            t.title.toLowerCase().includes(lowerQuery) ||
            t.priority.toLowerCase().includes(lowerQuery) ||
            t.type.toLowerCase().includes(lowerQuery)
        );

        if (searchStatusFilter === 'Pending') {
            results = results.filter(t => !t.completed);
        } else if (searchStatusFilter === 'Completed') {
            results = results.filter(t => t.completed);
        }

        return results;
    }, [state.tasks, searchQuery, searchStatusFilter]);

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

    const totalSpent = state.expenses.reduce((acc, curr) => acc + curr.amount, 0);

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

    const renderContent = () => {
        switch (activeTab) {
            case 'chat':
                return (
                    <section className="h-[calc(100vh-180px)]">
                        <ChatInterface 
                            dashboardState={state} 
                            sessions={chatSessions}
                            activeSessionId={activeSessionId}
                            onSessionChange={setActiveSessionId}
                            onCreateSession={createNewSession}
                            onDeleteSession={deleteSession}
                            onUpdateMessages={updateSessionMessages}
                            isListening={isListening}
                            onMicClick={toggleMic}
                        />
                    </section>
                );
            case 'calendar':
                return (
                    <section className="h-full">
                        <CalendarView tasks={state.tasks} />
                    </section>
                );
            case 'search':
                return (
                    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[60vh]">
                        <div className="relative mb-4">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400" size={18} />
                            <input 
                                autoFocus 
                                type="text" 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search tasks..." 
                                className="w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl py-4 pl-12 pr-10 text-white focus:outline-none focus:border-cyan-400/50 transition-all placeholder:text-white/20" 
                            />
                            {searchQuery && (
                                <button 
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        {searchQuery && (
                            <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                                {(['All', 'Pending', 'Completed'] as const).map(filter => (
                                    <button
                                        key={filter}
                                        onClick={() => setSearchStatusFilter(filter)}
                                        className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all whitespace-nowrap ${
                                            searchStatusFilter === filter 
                                            ? 'bg-cyan-400/20 border-cyan-400 text-cyan-400' 
                                            : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'
                                        }`}
                                    >
                                        {filter}
                                    </button>
                                ))}
                            </div>
                        )}
                        
                        <div className="space-y-3 pb-8">
                            {searchResults.map(task => (
                                <GlassCard key={task.id} className="py-4 px-5 flex items-center gap-4 border-white/5 hover:border-cyan-400/20 group">
                                    <button onClick={() => setState(s => ({ ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed, lastCompletedDate: !t.completed ? new Date().toISOString().split('T')[0] : undefined } : t) }))} className="transition-all active:scale-90">
                                        <div className={`p-2 rounded-full transition-colors ${task.completed ? 'bg-green-500/10 text-green-500' : 'bg-white/5 text-white/20 group-hover:text-cyan-400'}`}>
                                            {task.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                                        </div>
                                    </button>
                                    <div className="flex-1 min-w-0">
                                        <h4 className={`text-sm font-bold ${task.completed ? 'text-white/30 line-through' : 'text-white'}`}>{task.title}</h4>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[9px] font-bold uppercase tracking-wider text-white/40">{task.priority}</span>
                                            <span className="text-[9px] text-white/20">•</span>
                                            <span className="text-[9px] font-mono text-white/30">{new Date(task.startTime).toLocaleDateString()}</span>
                                            <span className="text-[9px] text-white/20">•</span>
                                            <span className="text-[9px] font-bold uppercase tracking-widest text-cyan-400/60">{task.type}</span>
                                        </div>
                                    </div>
                                </GlassCard>
                            ))}
                            {searchQuery && searchResults.length === 0 && (
                                <div className="text-center py-10 flex flex-col items-center opacity-30">
                                    <Search size={32} className="mb-2" />
                                    <span className="text-xs font-mono uppercase tracking-widest">No matching tasks found</span>
                                </div>
                            )}
                            {!searchQuery && (
                                <div className="text-center py-10 opacity-20">
                                    <span className="text-[10px] font-mono uppercase tracking-widest">Type to search archives...</span>
                                </div>
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

                            <GlassCard className="flex flex-col justify-between h-32 relative group">
                                <div className="flex justify-between items-start">
                                    <span className="text-[9px] font-bold text-white/30 tracking-[0.1em] uppercase">Daily Progress</span>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            resetDailyTasks();
                                        }}
                                        className="text-white/20 hover:text-cyan-400 transition-colors opacity-0 group-hover:opacity-100 p-1"
                                        title="Start New Day (Reset)"
                                    >
                                        <RefreshCcw size={12} />
                                    </button>
                                </div>
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
                        <GlassCard className="border-cyan-400/20 bg-cyan-400/5 overflow-visible">
                            <div className="flex justify-between items-center mb-3">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={16} className="text-cyan-400" />
                                    <span className="text-[10px] font-bold text-white/60 tracking-widest uppercase">Smart Advice</span>
                                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-400/10 border border-cyan-400/20 ml-1 animate-pulse">
                                        <Zap size={8} className="text-cyan-400 fill-cyan-400" />
                                        <span className="text-[7px] font-bold text-cyan-400 uppercase tracking-tighter">Flash Engine</span>
                                    </div>
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
                                        <button onClick={generatePerformanceReport} disabled={isGeneratingReport} className="text-cyan-400 p-2.5 bg-cyan-400/5 border border-cyan-400/20 rounded-xl hover:bg-cyan-400/15 transition-all shadow-lg flex items-center gap-2">
                                          {isGeneratingReport ? <Loader2 size={16} className="animate-spin" /> : <BarChart2 size={16} />}
                                          <span className="text-[9px] font-bold uppercase tracking-widest hidden sm:inline">Report</span>
                                        </button>
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
        <AuthProvider>
            <div className="min-h-screen relative pb-32">
                <div className="fixed top-0 left-0 w-full h-full bg-[#050505] -z-10" />
                
                {voiceError && (
                    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[150] w-[90%] max-w-md animate-in fade-in slide-in-from-top-4 duration-500">
                        <GlassCard className="border-red-500/50 bg-red-900/20 flex items-start gap-4 p-5 shadow-[0_0_50px_rgba(220,38,38,0.2)] backdrop-blur-2xl">
                            <div className="p-2 bg-red-500/20 rounded-xl mt-0.5">
                                <AlertTriangle className="text-red-500" size={20} />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-[0.2em] mb-1.5">System Alert</h4>
                                <p className="text-xs font-medium text-red-200/90 leading-relaxed font-mono">{voiceError}</p>
                            </div>
                            <button onClick={() => setVoiceError(null)} className="text-red-500/50 hover:text-red-500 transition-colors p-1">
                                <X size={18} />
                            </button>
                        </GlassCard>
                    </div>
                )}

                {/* Performance Report Modal */}
                {performanceReport && (
                  <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-black/90 backdrop-blur-3xl animate-in fade-in zoom-in-95 duration-500">
                    <GlassCard className="w-full max-w-xl p-10 border-cyan-500/40 shadow-[0_0_50px_rgba(6,182,212,0.1)]">
                      <div className="flex justify-between items-start mb-10">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 rounded-2xl bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center">
                            <Trophy className="text-cyan-400" size={28} />
                          </div>
                          <div>
                            <h2 className="text-2xl font-bold text-white uppercase tracking-widest">Mission Briefing</h2>
                            <p className="text-[9px] text-white/30 uppercase tracking-[0.3em] mt-1">Daily Performance Analysis</p>
                          </div>
                        </div>
                        <button onClick={() => setPerformanceReport(null)} className="p-3 text-white/20 hover:text-white transition-all"><X size={24} /></button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
                        <div className="flex flex-col items-center justify-center p-8 rounded-3xl bg-white/[0.02] border border-white/5 relative overflow-hidden group">
                          <div className="absolute inset-0 bg-cyan-400/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="relative z-10 text-center">
                            <span className="text-[10px] font-bold text-white/20 uppercase tracking-[0.3em] block mb-4">Overall Score</span>
                            <div className="text-6xl font-black text-cyan-400 tabular-nums mb-2">{performanceReport.score}</div>
                            <div className="w-full h-1 bg-white/5 rounded-full mt-4">
                              <div className="h-full bg-cyan-400 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)] transition-all duration-1000" style={{ width: `${performanceReport.score}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center gap-4">
                            <Target className="text-cyan-400" size={20} />
                            <div>
                              <div className="text-[10px] font-bold text-white/20 uppercase">Completed</div>
                              <div className="text-xl font-bold text-white tabular-nums">
                                {state.tasks.filter(t => t.type === 'Daily' && t.completed).length} / {state.tasks.filter(t => t.type === 'Daily').length}
                              </div>
                            </div>
                          </div>
                          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center gap-4">
                            <PieChart className="text-cyan-400" size={20} />
                            <div>
                              <div className="text-[10px] font-bold text-white/20 uppercase">Efficiency</div>
                              <div className="text-xl font-bold text-white tabular-nums">
                                {Math.round((state.tasks.filter(t => t.type === 'Daily' && t.completed).length / (state.tasks.filter(t => t.type === 'Daily').length || 1)) * 100)}%
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 rounded-3xl bg-black/40 border border-white/5 shadow-inner">
                        <div className="flex items-center gap-2 mb-4">
                          <Sparkles size={14} className="text-cyan-400" />
                          <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">AI Qualitative Analysis</span>
                        </div>
                        <p className="text-sm text-white/70 leading-relaxed font-medium whitespace-pre-line">
                          {performanceReport.summary}
                        </p>
                      </div>

                      <button 
                        onClick={() => setPerformanceReport(null)}
                        className="w-full mt-10 py-5 bg-cyan-400 text-black font-bold uppercase tracking-widest rounded-2xl hover:bg-cyan-300 transition-all shadow-lg active:scale-95"
                      >
                        Acknowledge
                      </button>
                    </GlassCard>
                  </div>
                )}

                {/* Updated Settings Modal */}
                {showSettings && (
                    <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/80 backdrop-blur-2xl animate-in fade-in duration-500">
                        <GlassCard className="w-full max-lg p-10 relative max-h-[90vh] overflow-y-auto border-cyan-400/20 shadow-2xl">
                            <button onClick={() => setShowSettings(false)} className="absolute top-6 right-6 text-white/20 hover:text-white transition-all"><X size={28} /></button>
                            <h2 className="text-2xl font-bold text-white mb-6 uppercase tracking-widest">Control Panel</h2>
                            
                            {/* Tab Switcher */}
                            <div className="flex gap-4 mb-8 border-b border-white/10 pb-1">
                                <button 
                                    onClick={() => setSettingsTab('general')} 
                                    className={`text-[10px] font-bold uppercase tracking-widest pb-2 transition-all border-b-2 ${settingsTab === 'general' ? 'text-cyan-400 border-cyan-400' : 'text-white/30 border-transparent hover:text-white/60'}`}
                                >
                                    <Settings size={14} className="inline mr-2 mb-0.5" /> General
                                </button>
                                <button 
                                    onClick={() => setSettingsTab('notifications')} 
                                    className={`text-[10px] font-bold uppercase tracking-widest pb-2 transition-all border-b-2 ${settingsTab === 'notifications' ? 'text-cyan-400 border-cyan-400' : 'text-white/30 border-transparent hover:text-white/60'}`}
                                >
                                    <Bell size={14} className="inline mr-2 mb-0.5" /> System Logs
                                </button>
                            </div>

                            {settingsTab === 'general' ? (
                                <div className="space-y-8 mb-10 animate-in fade-in slide-in-from-right-4 duration-300">
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
                                    
                                    <div className="grid grid-cols-2 gap-4">
                                        <button onClick={saveSettings} className="py-5 bg-cyan-400 text-black font-bold text-xs tracking-widest uppercase rounded-2xl flex items-center justify-center gap-3 hover:bg-cyan-300 transition-all active:scale-95"><Check size={18} /> Save Changes</button>
                                        <button onClick={signOut} className="py-5 bg-white/5 border border-white/10 rounded-2xl text-white/40 font-bold text-xs tracking-widest uppercase hover:text-red-500 transition-all flex items-center justify-center gap-3"><LogOut size={18} /> Sign Out</button>
                                    </div>
                                </div>
                            ) : (
                                <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-[9px] text-white/30 uppercase tracking-widest">Recent Activity</h3>
                                        <button onClick={() => setState(s => ({...s, notificationLogs: []}))} className="text-[9px] text-cyan-400/40 hover:text-cyan-400 uppercase font-bold tracking-widest transition-colors flex items-center gap-1">
                                            <Trash2 size={12} /> Clear Log
                                        </button>
                                    </div>
                                    <div className="space-y-3 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                                        {state.notificationLogs.length === 0 ? (
                                            <div className="py-12 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-2xl opacity-10">
                                                <FileText size={24} className="mb-2" />
                                                <span className="text-[8px] font-bold uppercase tracking-widest">No logs recorded</span>
                                            </div>
                                        ) : (
                                            state.notificationLogs.map(log => (
                                                <div key={log.id} className="p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:bg-white/[0.04] transition-colors">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">{log.title}</span>
                                                        <span className="text-[8px] font-mono text-white/30">{new Date(log.timestamp).toLocaleTimeString()} • {new Date(log.timestamp).toLocaleDateString()}</span>
                                                    </div>
                                                    <p className="text-[9px] text-white/50 font-mono leading-relaxed">{log.content}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
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
                                        false,
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

                    {activeTab === 'home' && (
                        <section className="flex flex-col items-center justify-center h-56 mb-12 relative animate-in fade-in duration-500">
                            <div className="absolute inset-0 bg-cyan-400/5 blur-[120px] rounded-full pointer-events-none animate-pulse"></div>
                            <JarvisOrb isListening={isListening} />
                        </section>
                    )}

                    {renderContent()}
                </main>

                <NavigationBar onMicClick={toggleMic} isListening={isListening} activeTab={activeTab} onTabChange={setActiveTab} />
            </div>
        </AuthProvider>
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
