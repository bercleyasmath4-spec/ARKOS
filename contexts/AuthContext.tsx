
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient.ts';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    needsPasswordReset: boolean;
    setNeedsPasswordReset: (val: boolean) => void;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    loading: true,
    needsPasswordReset: false,
    setNeedsPasswordReset: () => {},
    signOut: async () => { },
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [needsPasswordReset, setNeedsPasswordReset] = useState(false);

    useEffect(() => {
        let mounted = true;

        const initAuth = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (mounted) {
                    setSession(session);
                    setUser(session?.user ?? null);
                }
            } catch (err) {
                console.error("Auth initialization error", err);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        initAuth();
        
        // Failsafe: If Supabase takes too long, stop loading so the UI doesn't freeze.
        const failsafeTimer = setTimeout(() => {
            if (mounted && loading) {
                console.warn("Auth initialization timed out, releasing loading state.");
                setLoading(false);
            }
        }, 3000);

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (mounted) {
                setSession(session);
                setUser(session?.user ?? null);
                setLoading(false);
            }

            if (event === 'PASSWORD_RECOVERY') {
                if (mounted) setNeedsPasswordReset(true);
            }
        });

        return () => {
            mounted = false;
            clearTimeout(failsafeTimer);
            subscription.unsubscribe();
        };
    }, []);

    const signOut = async () => {
        try {
            await supabase.auth.signOut();
            setNeedsPasswordReset(false);
            setUser(null);
            setSession(null);
        } catch (error) {
            console.error("Sign out error", error);
            // Force state clear even if API fails
            setUser(null);
            setSession(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, session, loading, needsPasswordReset, setNeedsPasswordReset, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
