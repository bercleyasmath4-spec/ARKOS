
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Settings, X, Plus, Trash2, CheckCircle2, 
  Circle, AlertTriangle, Briefcase, Activity, Search, Bell, Shield, User, Globe, Smartphone, LogOut, Lock, Loader2
} from 'lucide-react';
import { INITIAL_STATE, PRIORITY_COLORS } from './constants';
import { DashboardState, Task, Expense, PriorityLevel, ExpenseCategory } from './types';
import JarvisOrb from './components/JarvisOrb';
import NavigationBar, { TabType } from './components/NavigationBar';
import GlassCard from './components/GlassCard';
import { GeminiVoiceService } from './services/geminiLive';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import { supabase } from './lib/supabaseClient';

const Dashboard: React.FC = () => {
    const { user, signOut, needsPasswordReset, setNeedsPasswordReset } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('home');
    const [showSettings, setShowSettings] = useState(false);
    const [showAddModal, setShowAddModal] = useState<'task' | 'expense' | null>(null);
    
    // Internal Settings Password Change
    const [showPasswordReset, setShowPasswordReset] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [settingsNewPassword, setSettingsNewPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [passwordUpdateStatus, setPasswordUpdateStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    const [resetLoading, setResetLoading] = useState(false);
    const [resetMessage, setResetMessage] = useState<string | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [voiceText, setVoiceText] = useState('SYSTEM ONLINE');
    
    const [state, setState] = useState<DashboardState>(() => {
        const saved = localStorage.getItem('arkos_db');
        return saved ? JSON.parse(saved) : INITIAL_STATE;
    });

    const voiceService = useRef<GeminiVoiceService | null>(null);

    // Sync state to local storage
    useEffect(() => {
        localStorage.setItem('arkos_db', JSON.stringify(state));
    }, [state]);

    // Initialize voice service
    useEffect(() => {
        voiceService.current = new GeminiVoiceService();
        return () => voiceService.current?.stop();
    }, []);

    // Effect to trigger password reset modal when recovery mode is active
    useEffect(() => {
        if (needsPasswordReset) {
            setShowPasswordReset(true);
        }
    }, [needsPasswordReset]);

    const handlePasswordUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setResetLoading(true);
        setResetMessage(null);
        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            setResetMessage("Passcode successfully encrypted and stored.");
            setNeedsPasswordReset(false); // Clear recovery flag
            setTimeout(() => {
                setShowPasswordReset(false);
                setResetMessage(null);
                setNewPassword('');
            }, 2000);
        } catch (error: any) {
            setResetMessage(`Security Error: ${error.message}`);
        } finally {
            setResetLoading(false);
        }
    };

    const handleInternalPasswordChange = async () => {
        if (!settingsNewPassword) return;
        setIsUpdatingPassword(true);
        setPasswordUpdateStatus(null);
        try {
            const { error } = await supabase.auth.updateUser({ password: settingsNewPassword });
            if (error) throw error;
            setPasswordUpdateStatus({ type: 'success', msg: 'PASSCODE UPDATED' });
            setSettingsNewPassword('');
            setTimeout(() => setPasswordUpdateStatus(null), 3000);
        } catch (err: any) {
            setPasswordUpdateStatus({ type: 'error', msg: err.message || 'UPDATE FAILED' });
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const addTask = useCallback((title: string, priority: PriorityLevel) => {
        const newTask: Task = {
            id: Date.now().toString(),
            title,
            deadline: 'Today',
            priority,
            completed: false
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
            date: new Date().toISOString().split('T')[0]
        };
        setState(prev => ({ ...prev, expenses: [newExpense, ...prev.expenses] }));
        setShowAddModal(null);
    }, []);

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
                    onAddTask: (title, priority) => addTask(title, priority),
                    onAddExpense: (label, amount, category) => addExpense(label, amount, category)
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
                        <GlassCard onClick={toggleMic} className={`group border-cyan-400/30 transition-all ${isListening ? 'bg-cyan-400/20' : 'bg-cyan-400/5 hover:bg-cyan-400/10'}`}>
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-full text-black shadow-lg transition-all ${isListening ? 'bg-red-500 animate-pulse' : 'bg-cyan-400 group-hover:scale-110'}`}>
                                    <Activity size={20} />
                                </div>
                                <div>
                                    <h3 className="text-white font-bold text-sm tracking-wide">{isListening ? 'SYSTEM LISTENING...' : 'REQUEST MISSION BRIEFING'}</h3>
                                    <p className="text-cyan-400/60 text-[10px] uppercase font-bold tracking-widest">{isListening ? 'Awaiting Audio Input' : 'Voice Authorized Access Only'}</p>
                                </div>
                            </div>
                        </GlassCard>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <GlassCard className={`flex flex-col justify-between h-36 ${isOverBudget ? 'border-red-500/50' : ''}`}>
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-[10px] font-bold text-white/40 tracking-widest uppercase">Global Budget</span>
                                        {isOverBudget && <AlertTriangle size={14} className="text-red-500 animate-pulse" />}
                                    </div>
                                    <h2 className="text-2xl font-bold text-white">${totalSpent.toLocaleString()}</h2>
                                </div>
                                <div className="space-y-2">
                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                        <div className={`h-full transition-all duration-1000 ${isOverBudget ? 'bg-red-500' : 'bg-cyan-400'}`} style={{ width: `${Math.min((totalSpent / state.budgetConfig.limit) * 100, 100)}%` }} />
                                    </div>
                                    <p className="text-[10px] text-white/30 font-medium">LIMIT: ${state.budgetConfig.limit.toLocaleString()}</p>
                                </div>
                            </GlassCard>
                            <GlassCard className="flex flex-col justify-between h-36">
                                <span className="text-[10px] font-bold text-white/40 tracking-widest uppercase mb-2">Active Protocols</span>
                                <div className="flex items-end justify-between">
                                    <h2 className="text-2xl font-bold text-white">{state.tasks.filter(t => !t.completed).length}</h2>
                                    <Briefcase size={24} className="text-cyan-400/20" />
                                </div>
                                <p className="text-[10px] text-cyan-400/60 font-medium">PENDING APPROVAL</p>
                            </GlassCard>
                        </div>
                        <section>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-[11px] font-bold tracking-[0.2em] text-white/40 uppercase">Task Matrix</h2>
                                <button onClick={() => setShowAddModal('task')} className="text-cyan-400 p-1 hover:bg-cyan-400/10 rounded-lg"><Plus size={18} /></button>
                            </div>
                            <div className="space-y-3">
                                {state.tasks.length === 0 ? <p className="text-xs text-white/20 text-center py-6 border border-dashed border-white/10 rounded-xl">Initialize your first protocol.</p> :
                                    state.tasks.map(task => (
                                        <GlassCard key={task.id} className="group py-3 px-4 flex items-center gap-4">
                                            <button onClick={() => setState(s => ({ ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t) }))} className="text-cyan-400/40 hover:text-cyan-400 transition-colors">
                                                {task.completed ? <CheckCircle2 size={20} className="text-green-400" /> : <Circle size={20} />}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <h4 className={`text-sm font-medium transition-all ${task.completed ? 'text-white/20 line-through' : 'text-white'}`}>{task.title}</h4>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border border-white/10" style={{ color: PRIORITY_COLORS[task.priority] }}>{task.priority}</span>
                                                    <span className="text-[10px] text-white/30">{task.deadline}</span>
                                                </div>
                                            </div>
                                            <button onClick={() => setState(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== task.id) }))} className="opacity-0 group-hover:opacity-100 text-red-500/40 hover:text-red-500 transition-all"><Trash2 size={16} /></button>
                                        </GlassCard>
                                    ))
                                }
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

            {showSettings && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <GlassCard className="w-full max-w-md p-8 relative max-h-[90vh] overflow-y-auto">
                        <button onClick={() => {
                            setShowSettings(false);
                            setPasswordUpdateStatus(null);
                        }} className="absolute top-4 right-4 text-white/40 hover:text-white"><X size={24} /></button>
                        
                        <h2 className="text-xl font-bold text-white mb-6 uppercase tracking-wider">System Settings</h2>
                        
                        <div className="space-y-4 mb-8">
                            {[
                                { label: 'Network Security', icon: Shield, value: 'Encrypted' },
                                { label: 'Voice Response', icon: Smartphone, value: 'Zephyr' },
                                { label: 'Data Sync', icon: Globe, value: 'Active' },
                                { label: 'User Profile', icon: User, value: user?.email || 'Default Admin' },
                            ].map((setting, i) => (
                                <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/10">
                                    <div className="flex items-center gap-3">
                                        <setting.icon size={18} className="text-cyan-400" />
                                        <span className="text-sm text-white/70">{setting.label}</span>
                                    </div>
                                    <span className="text-xs font-semibold text-cyan-400">{setting.value}</span>
                                </div>
                            ))}
                        </div>

                        {/* Security Protocol: Change Password */}
                        <div className="p-4 rounded-xl bg-white/5 border border-white/10 mb-8">
                            <div className="flex items-center gap-2 mb-4">
                                <Lock size={16} className="text-cyan-400" />
                                <h3 className="text-xs font-bold text-white/60 uppercase tracking-widest">Security Protocol</h3>
                            </div>
                            <div className="space-y-3">
                                <input 
                                    type="password"
                                    value={settingsNewPassword}
                                    onChange={(e) => setSettingsNewPassword(e.target.value)}
                                    placeholder="NEW PASSCODE..."
                                    className="w-full bg-black/40 border border-white/10 p-3 rounded-lg text-white text-xs focus:border-cyan-400 outline-none transition-all"
                                />
                                {passwordUpdateStatus && (
                                    <p className={`text-[10px] font-bold text-center uppercase tracking-wider ${passwordUpdateStatus.type === 'error' ? 'text-red-400' : 'text-green-400'}`}>
                                        {passwordUpdateStatus.msg}
                                    </p>
                                )}
                                <button 
                                    onClick={handleInternalPasswordChange}
                                    disabled={isUpdatingPassword || !settingsNewPassword}
                                    className="w-full py-3 bg-cyan-400/10 border border-cyan-400/30 rounded-lg text-cyan-400 text-[10px] font-bold uppercase tracking-widest hover:bg-cyan-400/20 disabled:opacity-30 flex items-center justify-center gap-2"
                                >
                                    {isUpdatingPassword ? <Loader2 size={14} className="animate-spin" /> : 'Update Passcode'}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <button onClick={signOut} className="w-full py-4 bg-white/5 border border-white/10 rounded-xl text-white/70 font-bold text-sm tracking-widest uppercase hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                                <LogOut size={16} /> Disconnect
                            </button>
                            <button onClick={() => { localStorage.removeItem('arkos_db'); window.location.reload(); }} className="w-full py-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-500 font-bold text-sm tracking-widest uppercase hover:bg-red-500/30 transition-all">Reset All Data</button>
                        </div>
                    </GlassCard>
                </div>
            )}

            {showPasswordReset && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center p-6 bg-black/95 backdrop-blur-xl animate-in zoom-in duration-300">
                    <GlassCard className="w-full max-w-sm p-8 border-cyan-400 shadow-[0_0_50px_rgba(0,242,255,0.2)]">
                        <div className="flex flex-col items-center mb-6">
                            <div className="w-12 h-12 rounded-full bg-cyan-400/10 flex items-center justify-center mb-4">
                                <Shield className="text-cyan-400" size={24} />
                            </div>
                            <h2 className="text-lg font-bold text-white uppercase tracking-widest text-center">Protocol Recovery</h2>
                            <p className="text-[10px] text-cyan-400/60 font-bold uppercase mt-1 tracking-widest">A.R.K.O.S. Security Override</p>
                        </div>
                        
                        <form onSubmit={handlePasswordUpdate} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest ml-1">New System Passcode</label>
                                <input required type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="ENTER NEW PASSCODE..." className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-white text-sm focus:border-cyan-400 outline-none transition-all" />
                            </div>
                            
                            {resetMessage && (
                                <p className={`text-[10px] text-center font-bold uppercase tracking-widest ${resetMessage.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
                                    {resetMessage}
                                </p>
                            )}
                            
                            <button type="submit" disabled={resetLoading || !newPassword} className="w-full py-3 bg-cyan-400 text-black font-black text-xs rounded-lg shadow-[0_0_20px_rgba(0,242,255,0.3)] hover:bg-cyan-300 transition-all disabled:opacity-50">
                                {resetLoading ? 'ENCRYPTING...' : 'CONFIRM ACCESS KEY'}
                            </button>
                            
                            {!needsPasswordReset && (
                                <button type="button" onClick={() => setShowPasswordReset(false)} className="w-full py-2 text-white/30 text-[10px] font-bold uppercase tracking-widest hover:text-white transition-colors">
                                    Cancel
                                </button>
                            )}
                        </form>
                    </GlassCard>
                </div>
            )}

            {showAddModal && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-md animate-in zoom-in duration-300">
                    <GlassCard className="w-full max-w-sm p-8 border-cyan-400/40">
                        <h2 className="text-lg font-bold text-white mb-6 uppercase tracking-widest">New {showAddModal === 'task' ? 'Protocol' : 'Transaction'}</h2>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            if (showAddModal === 'task') addTask(formData.get('title') as string, formData.get('priority') as PriorityLevel);
                            else addExpense(formData.get('label') as string, Number(formData.get('amount')), formData.get('category') as ExpenseCategory);
                        }} className="space-y-4">
                            <input required name={showAddModal === 'task' ? 'title' : 'label'} placeholder="IDENTIFIER..." className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-white text-sm focus:border-cyan-400 outline-none" />
                            {showAddModal === 'task' ? (
                                <select name="priority" className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-white text-sm outline-none">
                                    <option value="Critical">CRITICAL</option>
                                    <option value="Standard">STANDARD</option>
                                    <option value="Low">LOW</option>
                                </select>
                            ) : (
                                <>
                                    <input required type="number" name="amount" placeholder="VALUE..." className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-white text-sm focus:border-cyan-400 outline-none" />
                                    <select name="category" className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-white text-sm outline-none">
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
                                <button type="submit" className="flex-1 py-3 bg-cyan-400 text-black font-extrabold text-xs rounded-lg shadow-lg shadow-cyan-400/20">CONFIRM</button>
                            </div>
                        </form>
                    </GlassCard>
                </div>
            )}

            <main className="max-w-2xl mx-auto px-6 pt-10">
                <header className="flex justify-between items-start mb-10">
                    <div>
                        <div className="text-[10px] font-extrabold tracking-[0.2em] text-cyan-400 mb-1">A.R.K.O.S. OPERATIONAL</div>
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
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-400"></div>
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
