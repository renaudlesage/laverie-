import { createContext, useContext } from 'react';

export const ThemeContext = createContext(null);

// « Nuit » pose le thème sombre (QG de nuit), « Jour » le thème clair (plein soleil).
export default function BoutonTheme() {
  const { sombre, basculer } = useContext(ThemeContext);
  return (
    <button type="button" className="bouton bouton-discret" onClick={basculer} aria-pressed={sombre}>
      {sombre ? 'Jour' : 'Nuit'}
    </button>
  );
}
