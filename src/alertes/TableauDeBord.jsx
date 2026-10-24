import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { ETAT_STATUT, STATUTS_VETEMENT, TYPES_ALERTE } from '../lib/libelles.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useEnLigne } from '../connexion/useConnexion.js';
import { abonnerChangements } from '../hors-ligne/synchro.js';

const ORDRE_STATUTS = ['en_service', 'en_stock', 'a_decontaminer', 'collecte', 'en_laverie', 'en_traitement', 'traite', 'a_reparer', 'pret', 'perdu', 'reforme'];
const ETAT_ALERTE = {
  seuil_preventif: 'veille', seuil_atteint: 'chaud', age_maximal: 'chaud', usure_tag: 'veille',
  non_revenu: 'veille', ecart_reception: 'veille', melange_circuits: 'chaud',
};

// Chiffres du périmètre visible (la base applique les droits : la laverie externe ne voit que
// ce qui lui est confié). Mis à jour en direct quand un vêtement, un lot ou une alerte change.
export function useTableauDeBord() {
  const { organisation } = useOrganisation();
  const enLigne = useEnLigne();
  const [tableau, setTableau] = useState(null);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    const { data, error } = await supabase.rpc('tableau_de_bord', { org: organisation.id });
    setErreur(error);
    if (!error) setTableau(data);
  }, [organisation.id]);

  useEffect(() => {
    if (!enLigne) return undefined;
    charger();
    let minuterie = null;
    const arret = abonnerChangements(() => {
      clearTimeout(minuterie);
      minuterie = setTimeout(charger, 1000);
    });
    return () => {
      clearTimeout(minuterie);
      arret();
    };
  }, [charger, enLigne]);

  return { tableau, erreur, enLigne };
}

function Tuile({ libelle, valeur, etat, vers }) {
  const contenu = (
    <>
      <span className="etiquette">{libelle}</span>
      <strong>{valeur}</strong>
    </>
  );
  return (
    <li className={valeur > 0 ? `etat-${etat}` : ''}>
      {vers && valeur > 0 ? (
        <Link to={vers} className="tuile-lien">
          {contenu}
        </Link>
      ) : (
        contenu
      )}
    </li>
  );
}

export default function TableauDeBord() {
  const { tableau, erreur, enLigne } = useTableauDeBord();

  if (!enLigne) return <p className="message">Tableau de bord disponible en ligne.</p>;
  if (erreur) return <p className="message message-erreur">{messageErreur(erreur)}</p>;
  if (!tableau) return <p className="texte-secondaire">Chargement du tableau de bord…</p>;

  const statuts = ORDRE_STATUTS.filter((s) => tableau.statuts[s]);
  const total = Object.values(tableau.statuts).reduce((a, b) => a + b, 0);
  const alertes = Object.entries(tableau.alertes).sort((a, b) => b[1] - a[1]);
  const nbAlertes = alertes.reduce((a, [, n]) => a + n, 0);

  return (
    <div className="pile">
      <div className="carte">
        <h2>À surveiller</h2>
        <ul className="tuiles">
          <Tuile libelle="Fin de vie" valeur={tableau.fin_de_vie} etat="chaud" vers="/alertes?groupe=fin_de_vie" />
          <Tuile libelle="Fin de vie proche" valeur={tableau.fin_de_vie_proche} etat="veille" vers="/alertes?type=seuil_preventif" />
          <Tuile
            libelle={`En laverie > ${tableau.delai_laverie_jours} j`}
            valeur={tableau.en_laverie_trop_longtemps}
            etat="veille"
            vers="/alertes?type=non_revenu"
          />
          <Tuile
            libelle={`Collectés > ${tableau.delai_collecte_jours} j`}
            valeur={tableau.collectes_non_revenus}
            etat="veille"
            vers="/alertes?type=non_revenu"
          />
        </ul>
      </div>

      <div className="carte">
        <div className="entete-section">
          <h2>Alertes ouvertes ({nbAlertes})</h2>
          <Link to="/alertes" className="bouton bouton-discret">
            Tout voir
          </Link>
        </div>
        {alertes.length === 0 ? (
          <p className="texte-secondaire">Aucune alerte ouverte.</p>
        ) : (
          <ul className="tuiles">
            {alertes.map(([type, n]) => (
              <Tuile key={type} libelle={TYPES_ALERTE[type] ?? type} valeur={n} etat={ETAT_ALERTE[type] ?? 'info'} vers={`/alertes?type=${type}`} />
            ))}
          </ul>
        )}
      </div>

      <div className="carte">
        <h2>Vêtements par statut ({total})</h2>
        {statuts.length === 0 ? (
          <p className="texte-secondaire">Aucun vêtement visible.</p>
        ) : (
          <ul className="tuiles">
            {statuts.map((s) => (
              <Tuile key={s} libelle={STATUTS_VETEMENT[s]} valeur={tableau.statuts[s]} etat={ETAT_STATUT[s]} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
