import { createContext, useContext } from 'react';
import Icone from './Icone.jsx';

export const ThemeContext = createContext(null);

// « Sombre » pose le thème sombre (QG de nuit), « Clair » le thème clair (plein soleil).
export default function BoutonTheme() {
  const { sombre, basculer } = useContext(ThemeContext);
  return (
    <button type="button" className="bouton bouton-discret" onClick={basculer} aria-pressed={sombre} title={sombre ? 'Thème clair' : 'Thème sombre'}>
      <Icone nom={sombre ? 'clair' : 'sombre'} />
      <span className="libelle-icone">{sombre ? 'Clair' : 'Sombre'}</span>
    </button>
  );
}
