import { Navigate, Route, Routes } from 'react-router-dom';
import { configurationManquante } from './lib/supabase.js';
import { AuthProvider } from './auth/AuthProvider.jsx';
import { OrganisationProvider } from './organisation/OrganisationProvider.jsx';
import { ExigeOrganisation, ExigeSession } from './composants/Protections.jsx';
import Gabarit from './composants/Gabarit.jsx';
import Connexion from './pages/Connexion.jsx';
import ChoixOrganisation from './pages/ChoixOrganisation.jsx';
import Accueil from './pages/Accueil.jsx';
import VetementParCode from './pages/VetementParCode.jsx';
import ConfigurationManquante from './pages/ConfigurationManquante.jsx';

export default function App() {
  if (configurationManquante.length) {
    return <ConfigurationManquante variables={configurationManquante} />;
  }

  return (
    <AuthProvider>
      <OrganisationProvider>
        <Routes>
          <Route path="/connexion" element={<Connexion />} />
          <Route
            path="/organisation"
            element={
              <ExigeSession>
                <ChoixOrganisation />
              </ExigeSession>
            }
          />
          <Route
            element={
              <ExigeSession>
                <ExigeOrganisation>
                  <Gabarit />
                </ExigeOrganisation>
              </ExigeSession>
            }
          >
            <Route index element={<Accueil />} />
            <Route path="v/:code" element={<VetementParCode />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </OrganisationProvider>
    </AuthProvider>
  );
}
