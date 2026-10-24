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
import { ThemeContext } from './composants/BoutonTheme.jsx';
import { useTheme } from './lib/theme.js';
import Parametres from './pages/Parametres.jsx';
import ExigeDroit from './composants/ExigeDroit.jsx';
import Sites from './referentiels/Sites.jsx';
import Traitements from './referentiels/Traitements.jsx';
import Articles from './referentiels/Articles.jsx';
import ArticleDetail from './referentiels/ArticleDetail.jsx';
import Porteurs from './referentiels/Porteurs.jsx';
import ImportPorteurs from './referentiels/ImportPorteurs.jsx';
import Lecteurs from './referentiels/Lecteurs.jsx';
import Membres from './referentiels/Membres.jsx';
import Organisation from './referentiels/Organisation.jsx';
import Sacs from './referentiels/Sacs.jsx';
import Laverie from './laverie/Laverie.jsx';
import Collecte from './laverie/Collecte.jsx';
import Reception from './laverie/Reception.jsx';
import Lots from './laverie/Lots.jsx';
import LotDetail from './laverie/LotDetail.jsx';
import Controle from './laverie/Controle.jsx';
import Livraison from './laverie/Livraison.jsx';
import Scan from './pages/Scan.jsx';
import FicheVetement from './vetements/FicheVetement.jsx';
import Enrolement from './vetements/Enrolement.jsx';
import ImportVetements from './vetements/ImportVetements.jsx';
import Etiquettes from './etiquettes/Etiquettes.jsx';

function Protege({ droit, children }) {
  return <ExigeDroit droit={droit}>{children}</ExigeDroit>;
}

export default function App() {
  const theme = useTheme();

  if (configurationManquante.length) {
    return <ConfigurationManquante variables={configurationManquante} />;
  }

  return (
    <ThemeContext.Provider value={theme}>
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
              <Route path="scan" element={<Scan />} />
              <Route path="vetements/:id" element={<FicheVetement />} />
              <Route path="enrolement" element={<Protege droit="enrole"><Enrolement /></Protege>} />
              <Route path="vetements/import" element={<Protege droit="enrole"><ImportVetements /></Protege>} />
              <Route path="etiquettes" element={<Protege droit="enrole"><Etiquettes /></Protege>} />
              <Route path="parametres" element={<Protege droit="voitReferentiels"><Parametres /></Protege>} />
              <Route path="parametres/sites" element={<Protege droit="voitReferentiels"><Sites /></Protege>} />
              <Route path="parametres/traitements" element={<Protege droit="voitReferentiels"><Traitements /></Protege>} />
              <Route path="parametres/articles" element={<Protege droit="voitReferentiels"><Articles /></Protege>} />
              <Route path="parametres/articles/:id" element={<Protege droit="voitReferentiels"><ArticleDetail /></Protege>} />
              <Route path="parametres/porteurs" element={<Protege droit="voitReferentiels"><Porteurs /></Protege>} />
              <Route path="parametres/porteurs/import" element={<Protege droit="gerePorteurs"><ImportPorteurs /></Protege>} />
              <Route path="parametres/lecteurs" element={<Protege droit="voitReferentiels"><Lecteurs /></Protege>} />
              <Route path="parametres/membres" element={<Protege droit="estAdmin"><Membres /></Protege>} />
              <Route path="parametres/organisation" element={<Protege droit="estAdmin"><Organisation /></Protege>} />
              <Route path="parametres/sacs" element={<Protege droit="voitReferentiels"><Sacs /></Protege>} />
              <Route path="laverie" element={<Protege droit="livre"><Laverie /></Protege>} />
              <Route path="laverie/collecte" element={<Protege droit="collecte"><Collecte /></Protege>} />
              <Route path="laverie/reception" element={<Protege droit="gestesLaverie"><Reception /></Protege>} />
              <Route path="laverie/lots" element={<Protege droit="gestesLaverie"><Lots /></Protege>} />
              <Route path="laverie/lots/:id" element={<Protege droit="gestesLaverie"><LotDetail /></Protege>} />
              <Route path="laverie/controle" element={<Protege droit="gestesLaverie"><Controle /></Protege>} />
              <Route path="laverie/livraison" element={<Protege droit="livre"><Livraison /></Protege>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </OrganisationProvider>
      </AuthProvider>
    </ThemeContext.Provider>
  );
}
