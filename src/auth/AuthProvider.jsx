import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChargement(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evenement, nouvelleSession) => {
      setSession(nouvelleSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const valeur = {
    session,
    utilisateur: session?.user ?? null,
    chargement,
    connexionMotDePasse: (email, motDePasse) =>
      supabase.auth.signInWithPassword({ email, password: motDePasse }),
    connexionLienMagique: (email) =>
      supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
      }),
    deconnexion: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
