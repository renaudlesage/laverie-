import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [chargement, setChargement] = useState(true);
  // Vrai après une déconnexion volontaire : le compte suivant ne reprend pas la page du précédent.
  const [sortieVolontaire, setSortieVolontaire] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChargement(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evenement, nouvelleSession) => {
      setSession(nouvelleSession);
      if (nouvelleSession) setSortieVolontaire(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const valeur = {
    session,
    utilisateur: session?.user ?? null,
    chargement,
    sortieVolontaire,
    connexionMotDePasse: (email, motDePasse) =>
      supabase.auth.signInWithPassword({ email, password: motDePasse }),
    connexionLienMagique: (email) =>
      supabase.auth.signInWithOtp({
        email,
        // Le compte est créé au premier lien : c'est ainsi qu'une invitation devient une adhésion.
        options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
      }),
    deconnexion: async () => {
      setSortieVolontaire(true);
      // Hors ligne, la révocation côté serveur échoue : la session locale est effacée quand même.
      const { error } = await supabase.auth.signOut();
      if (error) await supabase.auth.signOut({ scope: 'local' });
    },
  };

  return <AuthContext.Provider value={valeur}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
