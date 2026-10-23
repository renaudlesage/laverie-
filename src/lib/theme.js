import { useEffect, useState } from 'react';

// Thème Eventware : data-theme="clair" | "sombre" sur <html>, absent = suit le système.
const CLE = 'suivi-linge.theme';

export function lireTheme() {
  try {
    const t = localStorage.getItem(CLE);
    return t === 'clair' || t === 'sombre' ? t : null;
  } catch {
    return null;
  }
}

export function appliquerTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff';
}

function systemeSombre() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function useTheme() {
  const [theme, setTheme] = useState(lireTheme);
  const [sombreSysteme, setSombreSysteme] = useState(systemeSombre);

  useEffect(() => {
    appliquerTheme(theme);
  }, [theme, sombreSysteme]);

  useEffect(() => {
    const requete = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!requete) return undefined;
    const maj = () => setSombreSysteme(requete.matches);
    requete.addEventListener('change', maj);
    return () => requete.removeEventListener('change', maj);
  }, []);

  const sombre = theme ? theme === 'sombre' : sombreSysteme;

  return {
    sombre,
    basculer: () => {
      const suivant = sombre ? 'clair' : 'sombre';
      try {
        localStorage.setItem(CLE, suivant);
      } catch {
        // Stockage indisponible : le choix vaut pour la session.
      }
      setTheme(suivant);
    },
  };
}
