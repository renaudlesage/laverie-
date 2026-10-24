import { createContext, useContext } from 'react';

export const ThemeContext = createContext(null);

// « Sombre » pose le thème sombre (QG de nuit), « Clair » le thème clair (plein soleil).
export default function BoutonTheme() {
  const { sombre, basculer } = useContext(ThemeContext);
  return (
    <button type="button" className="bouton bouton-discret" onClick={basculer} aria-pressed={sombre}>
      {sombre ? 'Clair' : 'Sombre'}
    </button>
  );
}
