
import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient.ts';
import { Fuel, Lock, Mail, ArrowRight, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import GlassCard from './GlassCard.tsx';

export default function Login() {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);
        try {
            if (mode === 'signup') {
                if (password !== confirmPassword) {
                    throw new Error("Passwords do not match");
                }
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                setMessage('Check your email for the confirmation link!');
            } else if (mode === 'signin') {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else if (mode === 'reset') {
                const { error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin,
                });
                if (error) throw error;
                setMessage('Password reset instructions sent to your email!');
            }
        } catch (error: any) {
            setError(error.message || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#050505]">
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="w-full max-w-md px-6 relative z-10 animate-in fade-in zoom-in duration-500">
                <GlassCard className="p-8 border-cyan-500/20 shadow-2xl shadow-cyan-500/5">
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mb-6 animate-pulse ring-1 ring-cyan-500/30">
                            <Fuel size={32} className="text-cyan-400" />
                        </div>
                        <h1 className="text-2xl font-light text-white tracking-wider">A.R.K.O.S.</h1>
                        <p className="text-[10px] text-cyan-400/60 font-bold tracking-[0.3em] uppercase mt-2">
                            {mode === 'signin' ? 'Secure Access Terminal' : mode === 'signup' ? 'New Protocol Initialization' : 'Credentials Recovery'}
                        </p>
                    </div>
                    <form onSubmit={handleAuth} className="space-y-4">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-3">
                                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={16} />
                                <p className="text-red-200 text-xs">{error}</p>
                            </div>
                        )}
                        {message && (
                            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                                <p className="text-green-200 text-xs text-center">{message}</p>
                            </div>
                        )}
                        <div className="space-y-4">
                            <div className="relative group">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-cyan-400 transition-colors" size={18} />
                                <input
                                    type="email"
                                    placeholder="OPERATOR ID (EMAIL)"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-cyan-400/50 transition-all"
                                />
                            </div>
                            {mode !== 'reset' && (
                                <div className="relative group">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-cyan-400 transition-colors" size={18} />
                                    <input
                                        type="password"
                                        placeholder="PASSCODE"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-cyan-400/50 transition-all"
                                    />
                                </div>
                            )}
                            {mode === 'signup' && (
                                <div className="relative group">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-cyan-400 transition-colors" size={18} />
                                    <input
                                        type="password"
                                        placeholder="CONFIRM PASSCODE"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white text-sm focus:outline-none focus:border-cyan-400/50 transition-all"
                                    />
                                </div>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold py-3 rounded-xl transition-all duration-300 flex items-center justify-center gap-2 mt-6 disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="animate-spin" size={18} /> : (
                                <>
                                    {mode === 'signup' ? 'INITIALIZE PROTOCOL' : mode === 'reset' ? 'SEND RECOVERY LINK' : 'AUTHENTICATE'}
                                    {mode === 'reset' ? <RefreshCw size={18} /> : <ArrowRight size={18} />}
                                </>
                            )}
                        </button>
                    </form>
                    <div className="mt-6 flex flex-col gap-3 text-center">
                        {mode === 'signin' ? (
                            <>
                                <button onClick={() => setMode('signup')} className="text-xs text-white/40 hover:text-cyan-400 transition-colors uppercase tracking-wider">New User? Initialize Protocol</button>
                                <button onClick={() => setMode('reset')} className="text-[10px] text-white/20 hover:text-white/60 transition-colors">Forgot Passcode?</button>
                            </>
                        ) : (
                            <button onClick={() => setMode('signin')} className="text-xs text-white/40 hover:text-cyan-400 transition-colors uppercase tracking-wider">Return to Login</button>
                        )}
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}
