
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Settings, X, Plus, Trash2, CheckCircle2, 
  Circle, AlertTriangle, Briefcase, Activity, Search, Bell, Shield, User, Globe, Smartphone, LogOut, Lock, Loader2, ArrowUpRight, BarChart2, ClipboardList, Copy, Check, Mail, Send
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { INITIAL_STATE, PRIORITY_COLORS } from './constants.tsx';
import { DashboardState, Task, Expense, PriorityLevel, ExpenseCategory, TaskType, PerformanceReport, NotificationSettings } from './types.ts';
import JarvisOrb from './components/JarvisOrb.tsx';
import NavigationBar, { TabType } from './components/NavigationBar.tsx';
import GlassCard from './components/GlassCard.tsx';
import { GeminiVoiceService } from './services/geminiLive.ts';
import { NotificationService } from './services/notificationService.ts';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';
import Login from './components/Login.tsx';
import { supabase } from './lib/supabaseClient.ts';

const Dashboard: React.FC = () => {
    const { user, signOut, needsPasswordReset, setNeedsPasswordReset } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('home');
    const [taskTab, setTaskTab] = useState<TaskType>('Daily');
    const [showSettings, setShowSettings] = useState(false);
    const [showAddModal, setShowAddModal] = useState<'task' | 'expense' | null>(null);
    const [performanceReport, setPerformanceReport] = useState<PerformanceReport | null>(null);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [isEmailing, setIsEmailing] = useState(false);
    
    // Recovery Passcode Reset
    const [showPasswordReset, setShowPasswordReset] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmNewPassword, setConfirmNewPassword] = useState('');
    
    // Internal Settings Passcode Change
    const [settingsOldPassword, setSettingsOldPassword] = useState('');
    const [settingsNewPassword, setSettingsNewPassword] = useState('');
    const [settingsConfirmPassword, setSettingsConfirmPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [passwordUpdateStatus, setPasswordUpdateStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    const [resetLoading, setResetLoading] = useState(false);
    const [resetMessage, setResetMessage] = useState<string | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [voiceText, setVoiceText] = useState('SYSTEM ONLINE');
    
    const [state, setState] = useState<DashboardState>(() => {
        try {
            const saved = localStorage.getItem('arkos_db');
            if (!saved) return INITIAL_STATE;
            const parsed = JSON.parse(saved);
            if (!parsed.tasks || !parsed.expenses) return INITIAL_STATE;
            // Ensure notification settings exist in legacy state
            if (!parsed.notificationSettings) parsed.notificationSettings = INITIAL_STATE.notificationSettings;
            return parsed;
        } catch (e) {
            console.error("Failed to parse state from localStorage", e);
            return INITIAL_STATE;
        }
    });

    const voiceService = useRef<GeminiVoiceService | null>(null);
    const notificationService = useRef<NotificationService>(new NotificationService());

    useEffect(() => {
        localStorage.setItem('arkos_db', JSON.stringify(state));
    }, [state]);

    // Periodically check for deadlines
    useEffect(() => {
      const interval = setInterval(async () => {
        const notifiedIds = await notificationService.current.checkDeadlines(state.tasks, state.notificationSettings);
        if (notifiedIds.length > 0) {
          setState(prev => ({
            ...prev,
            tasks: prev.tasks.map(t => notifiedIds.includes(t.id) ? { ...t, lastNotified: new Date().toISOString() } : t)
          }));
          setVoiceText("CRITICAL DISPATCH SENT TO TERMINAL.");
        }
      }, 1000 * 60 * 5); // Every 5 minutes
      return () => clearInterval(interval);
    }, [state.tasks, state.notificationSettings]);

    useEffect(() => {
        voiceService.current = new GeminiVoiceService();
        return () => voiceService.current?.stop();
    }, []);

    useEffect(() => {
        if (needsPasswordReset) {
            setShowPasswordReset(true);
        }
    }, [needsPasswordReset]);

    const handlePasswordUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmNewPassword) {
            setResetMessage("Security Error: Passcodes do not match.");
            return;
        }
        setResetLoading(true);
        setResetMessage(null);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            setResetMessage("Passcode successfully encrypted and stored.");
            setNeedsPasswordReset(false);
            setTimeout(() => {
                setShowPasswordReset(false);
                setResetMessage(null);
                setNewPassword('');
                setConfirmNewPassword('');
            }, 2000);
        } catch (error: any) {
            setResetMessage(`Security Error: ${error.message}`);
        } finally {
            setResetLoading(false);
        }
    };

    const updateNotificationSettings = (updates: Partial<NotificationSettings>) => {
      setState(prev => ({
        ...prev,
        notificationSettings: { ...prev.notificationSettings, ...updates }
      }));
    };

    const handleInternalPasswordChange = async () => {
        if (!settingsOldPassword || !settingsNewPassword || !settingsConfirmPassword) {
            setPasswordUpdateStatus({ type: 'error', msg: 'ALL FIELDS REQUIRED' });
            return;
        }
        if (settingsNewPassword !== settingsConfirmPassword) {
            setPasswordUpdateStatus({ type: 'error', msg: 'NEW PASSCODES DO NOT MATCH' });
            return;
        }
        
        setIsUpdatingPassword(true);
        setPasswordUpdateStatus(null);
        
        try {
            const { error: authError } = await supabase.auth.signInWithPassword({
                email: user?.email || '',
                password: settingsOldPassword,
            });

            if (authError) throw new Error("INVALID CURRENT PASSCODE");

            const { error: updateError } = await supabase.auth.updateUser({ password: settingsNewPassword });
            if (updateError) throw updateError;

            setPasswordUpdateStatus({ type: 'success', msg: 'PASSCODE UPDATED' });
            setSettingsOldPassword('');
            setSettingsNewPassword('');
            setSettingsConfirmPassword('');
            setTimeout(() => setPasswordUpdateStatus(null), 3000);
        } catch (err: any) {
            setPasswordUpdateStatus({ type: 'error', msg: err.message || 'UPDATE FAILED' });
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const addTask = useCallback((title: string, priority: PriorityLevel, target: TaskType = 'Daily') => {
        const newTask: Task = {
            id: Date.now().toString(),
            title,
            deadline: 'Today',
            priority,
            completed: false,
            type: target
        };
        setState(prev => ({ ...prev, tasks: [newTask, ...prev.tasks] }));
        setShowAddModal(null);
    }, []);

    const promoteTask = (taskId: string) => {
        setState(prev => ({
            ...prev,
            tasks: prev.tasks.map(t => 
                t.id === taskId ? { ...t, type: 'Daily' as TaskType } : t
            )
        }));
    };

    const addExpense = useCallback((label: string, amount: number, category: ExpenseCategory) => {
        const newExpense: Expense = {
            id: Date.now().toString(),
            label,
            amount,
            category,
            date: new Date().toISOString().split('T')[0]
        };
        setState(prev => ({ ...prev, expenses: [newExpense, ...prev.expenses] }));
        setShowAddModal(null);
    }, []);

    const generatePerformanceReport = async () => {
        setIsGeneratingReport(true);
        setVoiceText("A.R.K.O.S. ANALYZING PERFORMANCE...");
        
        const dailyTasks = state.tasks.filter(t => t.type === 'Daily');
        const completed = dailyTasks.filter(t => t.completed);
        const incomplete = dailyTasks.filter(t => !t.completed);
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: `A.R.K.O.S. Operations Debrief Request.
                
                Format the output as a clean, structured list ready for copy-pasting. 
                Use bullet points for achievements.
                Include a "Summary" section, an "Achievement List" section, and a "Remaining Protocols" section.
                
                Operational Data:
                - COMPLETED ACHIEVEMENTS: ${completed.length > 0 ? completed.map(t => t.title).join(', ') : 'None'}
                - PENDING PROTOCOLS: ${incomplete.length > 0 ? incomplete.map(t => t.title).join(', ') : 'None'}
                
                Tone: Tony Stark assistant (professional, witty, efficient). 
                Keep it concise and sharp.`
            });
            
            const score = dailyTasks.length > 0 ? (completed.length / dailyTasks.length) * 100 : 0;
            
            setPerformanceReport({
                summary: response.text || "Report generation failed.",
                score: Math.round(score),
                timestamp: new Date().toLocaleTimeString()
            });
            setVoiceText("REPORT GENERATED, SIR.");
        } catch (err) {
            console.error(err);
        } finally {
            setIsGeneratingReport(false);
        }
    };

    const dispatchDailyBriefingEmail = async () => {
      setIsEmailing(true);
      setVoiceText("PREPARING BRIEFING DISPATCH...");
      try {
        await notificationService.current.emailDailyBriefing(state.tasks, state.notificationSettings.operatorEmail || user?.email || '');
        setVoiceText("BRIEFING DISPATCHED TO TERMINAL.");
      } catch (err: any) {
        setVoiceText(`DISPATCH ERROR: ${err.message}`);
      } finally {
        setIsEmailing(false);
      }
    };

    const copyReportToClipboard = () => {
        if (!performanceReport) return;
        const textToCopy = `A.R.K.O.S. OPERATIONS DEBRIEF\nTimestamp: ${performanceReport.timestamp}\nEfficacy Score: ${performanceReport.score}%\n\n${performanceReport.summary}`;
        navigator.clipboard.writeText(textToCopy).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };

    const toggleMic = async () => {
        if (isListening) {
            voiceService.current?.stop();
            setIsListening(false);
            setVoiceText('AWAITING COMMAND...');
        } else {
            try {
                setIsListening(true);
                setVoiceText('A.R.K.O.S. IS LISTENING...');
                await voiceService.current?.start(state, {
                    onMessage: (text) => setVoiceText(text),
                    onAddTask: (title, priority, target) => addTask(title, priority, target),
                    onAddExpense: (label, amount, category) => addExpense(label, amount, category),
                    onGenerateReport: () => generatePerformanceReport(),
                    onDispatchEmail: () => dispatchDailyBriefingEmail()
                });
            } catch (err) {
                console.error(err);
                setIsListening(false);
                setVoiceText('INITIALIZATION FAILED');
            }
        }
    };

    const totalSpent = state.expenses.reduce((acc, curr) => acc + curr.amount, 0);
    const isOverBudget = totalSpent > state.budgetConfig.limit;

    const renderContent = () => {
        switch (activeTab) {
            case 'search':
                return (
                    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-[11px] font-bold tracking-widest text-white/50 uppercase mb-6">System Search</h2>
                        <div className="relative mb-8">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-cyan-400" size={18} />
                            <input autoFocus type="text" placeholder="Query A.R.K.O.S. database..." className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-cyan-400 transition-colors" />
                        </div>
                        <p className="text-xs text-white/30 text-center py-10 italic">No search results found.</p>
                    </section>
                );
            case 'notifications':
                return (
                    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <h2 className="text-[11px] font-bold tracking-widest text-white/50 uppercase mb-6">Recent Alerts</h2>
                        <div className="flex flex-col items-center justify-center py-20 space-y-4">
                            <div className="p-4 bg-white/5 rounded-full text-white/20"><Bell size={32} /></div>
                            <p className="text-sm text-white/30 italic">No active notifications.</p>
                        </div>
                    </section>
                );
            default:
                return (
                    <div className="space-y-8 animate-in fade-in duration-700">
                        {/* Status HUD */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <GlassCard className={`flex flex-col justify-between h-32 ${isOverBudget ? 'border-red-500/50' : ''}`}>
                                <span className="text-[9px] font-bold text-white/40 tracking-widest uppercase">Budget</span>
                                <h2 className="text-xl font-bold text-white">${totalSpent.toLocaleString()}</h2>
                                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div className={`h-full bg-cyan-400 transition-all`} style={{ width: `${Math.min((totalSpent / state.budgetConfig.limit) * 100, 100)}%` }} />
                                </div>
                            </GlassCard>
                            <GlassCard className="flex flex-col justify-between h-32">
                                <span className="text-[9px] font-bold text-white/40 tracking-widest uppercase">Daily Ops</span>
                                <h2 className="text-xl font-bold text-white">
                                    {state.tasks.filter(t => t.type === 'Daily' && t.completed).length} / {state.tasks.filter(t => t.type === 'Daily').length}
                                </h2>
                                <p className="text-[9px] text-cyan-400/60 font-medium">COMPLETED TODAY</p>
                            </GlassCard>
                            <GlassCard className="hidden md:flex flex-col justify-between h-32">
                                <span className="text-[9px] font-bold text-white/40 tracking-widest uppercase">Comm Link</span>
                                <div className="flex items-center gap-2">
                                  <h2 className="text-xl font-bold text-white">{state.notificationSettings.emailEnabled ? 'ACTIVE' : 'OFFLINE'}</h2>
                                  <Mail size={16} className={state.notificationSettings.emailEnabled ? 'text-cyan-400' : 'text-white/20'} />
                                </div>
                                <p className="text-[9px] text-cyan-400/60 font-medium uppercase tracking-widest">Email Alerts</p>
                            </GlassCard>
                        </div>

                        {/* Task Matrix Core */}
                        <section>
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex gap-4">
                                    <button 
                                        onClick={() => setTaskTab('Daily')}
                                        className={`text-[11px] font-bold tracking-widest uppercase transition-all ${taskTab === 'Daily' ? 'text-cyan-400 border-b border-cyan-400 pb-1' : 'text-white/30'}`}
                                    >
                                        Daily Action Items
                                    </button>
                                    <button 
                                        onClick={() => setTaskTab('Main')}
                                        className={`text-[11px] font-bold tracking-widest uppercase transition-all ${taskTab === 'Main' ? 'text-cyan-400 border-b border-cyan-400 pb-1' : 'text-white/30'}`}
                                    >
                                        Main Strategy
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    {taskTab === 'Daily' && (
                                      <>
                                        <button 
                                            onClick={dispatchDailyBriefingEmail}
                                            disabled={isEmailing}
                                            className="text-cyan-400 p-2 bg-cyan-400/10 rounded-lg hover:bg-cyan-400/20 disabled:opacity-30"
                                            title="Email full briefing"
                                        >
                                            {isEmailing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                        </button>
                                        <button 
                                            onClick={generatePerformanceReport}
                                            disabled={isGeneratingReport}
                                            className="text-cyan-400 p-2 bg-cyan-400/10 rounded-lg hover:bg-cyan-400/20 disabled:opacity-30"
                                            title="Generate performance report"
                                        >
                                            {isGeneratingReport ? <Loader2 size={16} className="animate-spin" /> : <BarChart2 size={16} />}
                                        </button>
                                      </>
                                    )}
                                    <button onClick={() => setShowAddModal('task')} className="text-white/50 p-2 bg-white/5 rounded-lg hover:bg-white/10"><Plus size={16} /></button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {state.tasks.filter(t => t.type === taskTab).length === 0 ? (
                                    <div className="py-12 flex flex-col items-center border border-dashed border-white/10 rounded-2xl">
                                        <ClipboardList className="text-white/10 mb-3" size={32} />
                                        <p className="text-xs text-white/20 uppercase tracking-widest">No active protocols in this sector.</p>
                                    </div>
                                ) : (
                                    state.tasks.filter(t => t.type === taskTab).map(task => (
                                        <GlassCard key={task.id} className="group py-4 px-5 flex items-center gap-5">
                                            <button 
                                                onClick={() => setState(s => ({ ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t) }))} 
                                                className="text-cyan-400/40 hover:text-cyan-400 transition-colors"
                                            >
                                                {task.completed ? <CheckCircle2 size={22} className="text-green-400" /> : <Circle size={22} />}
                                            </button>
                                            
                                            <div className="flex-1 min-w-0">
                                                <h4 className={`text-sm font-semibold tracking-wide transition-all ${task.completed ? 'text-white/20 line-through' : 'text-white'}`}>{task.title}</h4>
                                                <div className="flex items-center gap-3 mt-1.5">
                                                    <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded border border-white/10" style={{ color: (PRIORITY_COLORS as any)[task.priority] || '#FFF' }}>{task.priority}</span>
                                                    {taskTab === 'Main' && <span className="text-[8px] text-white/30 uppercase tracking-widest font-bold">Main Strategy</span>}
                                                </div>
                                            </div>

                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                {taskTab === 'Main' && (
                                                    <button 
                                                        onClick={() => promoteTask(task.id)}
                                                        className="p-1.5 text-cyan-400/50 hover:text-cyan-400 hover:bg-cyan-400/10 rounded"
                                                        title="Promote to Daily"
                                                    >
                                                        <ArrowUpRight size={16} />
                                                    </button>
                                                )}
                                                <button onClick={() => setState(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== task.id) }))} className="p-1.5 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded"><Trash2 size={16} /></button>
                                            </div>
                                        </GlassCard>
                                    ))
                                )}
                            </div>
                        </section>
                    </div>
                );
        }
    };

    return (
        <div className="min-h-screen relative pb-32">
            <div className="fixed top-0 left-0 w-full h-full bg-[#050505] -z-10" />
            <div className="fixed top-[-100px] left-[-50px] w-[300px] h-[300px] bg-cyan-400 opacity-[0.08] blur-[100px] pointer-events-none" />
            <div className="fixed bottom-0 right-[-50px] w-[300px] h-[300px] bg-cyan-400 opacity-[0.05] blur-[100px] pointer-events-none" />

            {/* Performance Report Modal */}
            {performanceReport && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
                    <GlassCard className="w-full max-w-lg p-8 border-cyan-400 shadow-[0_0_100px_rgba(0,242,255,0.1)] overflow-hidden flex flex-col max-h-[85vh]">
                        <div className="flex justify-between items-center mb-6 shrink-0">
                            <div className="flex items-center gap-3">
                                <BarChart2 className="text-cyan-400" size={24} />
                                <h2 className="text-lg font-bold text-white tracking-[0.2em] uppercase">Operations Debrief</h2>
                            </div>
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={copyReportToClipboard}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-cyan-400/10 border border-cyan-400/30 rounded-lg text-cyan-400 text-[10px] font-bold uppercase tracking-widest hover:bg-cyan-400/20 transition-all"
                                >
                                    {isCopied ? <Check size={14} /> : <Copy size={14} />}
                                    {isCopied ? 'COPIED TO HUD' : 'COPY DEBRIEF'}
                                </button>
                                <button onClick={() => setPerformanceReport(null)} className="text-white/30 hover:text-white p-1"><X size={20} /></button>
                            </div>
                        </div>
                        
                        <div className="overflow-y-auto pr-2 custom-scrollbar">
                            <div className="space-y-6">
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                    <div className="flex justify-between items-end mb-2">
                                        <span className="text-[10px] font-bold text-white/40 uppercase">Efficacy Score</span>
                                        <span className="text-2xl font-black text-cyan-400">{performanceReport.score}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-black rounded-full overflow-hidden">
                                        <div className="h-full bg-cyan-400" style={{ width: `${performanceReport.score}%` }} />
                                    </div>
                                </div>
                                
                                <div className="relative p-6 bg-black/40 border border-white/5 rounded-2xl font-mono">
                                    <div className="absolute top-2 right-4 text-[8px] text-white/10 font-bold tracking-widest uppercase">STARK-OS ENCRYPTION ACTIVE</div>
                                    <pre className="text-xs leading-relaxed text-white/80 whitespace-pre-wrap font-sans">
                                        {performanceReport.summary}
                                    </pre>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-white/5 shrink-0 mt-4">
                            <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{performanceReport.timestamp}</span>
                            <span className="text-[9px] font-bold text-cyan-400/60 uppercase tracking-widest">A.R.K.O.S. Security Signature</span>
                        </div>
                    </GlassCard>
                </div>
            )}

            {showSettings && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <GlassCard className="w-full max-w-md p-8 relative max-h-[90vh] overflow-y-auto border-cyan-400/30">
                        <button onClick={() => {
                            setShowSettings(false);
                            setPasswordUpdateStatus(null);
                            setSettingsOldPassword('');
                        }} className="absolute top-4 right-4 text-white/40 hover:text-white"><X size={24} /></button>
                        
                        <h2 className="text-xl font-bold text-white mb-6 uppercase tracking-wider">System Configuration</h2>
                        
                        {/* Notification Management */}
                        <div className="mb-8 space-y-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Bell size={16} className="text-cyan-400" />
                            <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest">Comm-Link Protocols</h3>
                          </div>
                          
                          <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-4">
                            <div className="flex justify-between items-center">
                              <div className="flex flex-col">
                                <span className="text-sm text-white font-medium">Email Alerts</span>
                                <span className="text-[10px] text-white/40">Critical deadline notifications</span>
                              </div>
                              <button 
                                onClick={() => updateNotificationSettings({ emailEnabled: !state.notificationSettings.emailEnabled })}
                                className={`w-12 h-6 rounded-full transition-all relative ${state.notificationSettings.emailEnabled ? 'bg-cyan-400' : 'bg-white/10'}`}
                              >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${state.notificationSettings.emailEnabled ? 'left-7' : 'left-1'}`} />
                              </button>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[8px] font-bold text-white/40 uppercase tracking-widest ml-1">Primary Operator Email</label>
                                <div className="relative">
                                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                                  <input 
                                      type="email"
                                      value={state.notificationSettings.operatorEmail}
                                      onChange={(e) => updateNotificationSettings({ operatorEmail: e.target.value })}
                                      placeholder="ENTER ADDRESS..."
                                      className="w-full bg-black/40 border border-white/10 p-3 pl-9 rounded-xl text-white text-xs focus:border-cyan-400 outline-none transition-all"
                                  />
                                </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3">
                            <button onClick={signOut} className="w-full py-4 bg-white/5 border border-white/10 rounded-xl text-white/70 font-bold text-sm tracking-widest uppercase hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                                <LogOut size={16} /> Disconnect
                            </button>
                            <button onClick={() => { localStorage.removeItem('arkos_db'); window.location.reload(); }} className="w-full py-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-500 font-bold text-sm tracking-widest uppercase hover:bg-red-500/30 transition-all">Clear Database</button>
                        </div>
                    </GlassCard>
                </div>
            )}

            {showAddModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md animate-in zoom-in duration-300">
                    <GlassCard className="w-full max-sm p-8 border-cyan-400/40">
                        <h2 className="text-lg font-bold text-white mb-6 uppercase tracking-widest">New {showAddModal === 'task' ? 'Protocol' : 'Transaction'}</h2>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            if (showAddModal === 'task') addTask(formData.get('title') as string, formData.get('priority') as PriorityLevel, formData.get('target') as TaskType);
                            else addExpense(formData.get('label') as string, Number(formData.get('amount')), formData.get('category') as ExpenseCategory);
                        }} className="space-y-4">
                            <input required name={showAddModal === 'task' ? 'title' : 'label'} placeholder="IDENTIFIER..." className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-white text-sm focus:border-cyan-400 outline-none" />
                            {showAddModal === 'task' ? (
                                <>
                                    <div className="flex gap-2">
                                        <select name="priority" className="flex-1 bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm outline-none">
                                            <option value="Critical">CRITICAL</option>
                                            <option value="Standard">STANDARD</option>
                                            <option value="Low">LOW</option>
                                        </select>
                                        <select name="target" className="flex-1 bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm outline-none">
                                            <option value="Daily">DAILY ACTION</option>
                                            <option value="Main">MAIN STRATEGY</option>
                                        </select>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <input required type="number" name="amount" placeholder="VALUE..." className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm focus:border-cyan-400 outline-none" />
                                    <select name="category" className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white text-sm outline-none">
                                        <option value="Food">FOOD</option>
                                        <option value="Rent">RENT</option>
                                        <option value="Travel">TRAVEL</option>
                                        <option value="Tech">TECH</option>
                                        <option value="Health">HEALTH</option>
                                        <option value="Other">OTHER</option>
                                    </select>
                                </>
                            )}
                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setShowAddModal(null)} className="flex-1 py-3 text-white/40 font-bold text-xs">CANCEL</button>
                                <button type="submit" className="flex-1 py-3 bg-cyan-400 text-black font-extrabold text-xs rounded-xl shadow-lg shadow-cyan-400/20">CONFIRM</button>
                            </div>
                        </form>
                    </GlassCard>
                </div>
            )}

            <main className="max-w-2xl mx-auto px-6 pt-10">
                <header className="flex justify-between items-start mb-10">
                    <div>
                        <div className="text-[10px] font-extrabold tracking-[0.2em] text-cyan-400 mb-1 uppercase">Operational HUD Online</div>
                        <h1 className="text-3xl font-light text-white">System <span className="font-bold">Active.</span></h1>
                        <p className="text-sm text-white/40 mt-1">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                    </div>
                    <button onClick={() => setShowSettings(true)} className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-cyan-400 hover:border-cyan-400 transition-colors"><Settings size={20} /></button>
                </header>

                <section className="flex flex-col items-center justify-center h-48 mb-10">
                    <JarvisOrb isListening={isListening} />
                    <div className="mt-8 text-[9px] tracking-[0.3em] font-bold text-cyan-400 uppercase text-center max-w-[80%] line-clamp-2 min-h-[24px]">{voiceText}</div>
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
        <div className="min-h-screen bg-[#050505] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-400"></div>
                <p className="text-cyan-400/40 text-[10px] font-bold tracking-[0.2em] uppercase">Syncing with Central Core...</p>
            </div>
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
