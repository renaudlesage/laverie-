import { useState } from 'react';
import { Link } from 'react-router-dom';
import { base } from '../hors-ligne/base.js';
import { useLocal, vetementsParStatut } from '../hors-ligne/local.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import Rafale from '../identification/Rafale.jsx';
import { evenement } from '../journal/journal.js';
import CompteRendu from './Envoi.jsx';
import { codeVisible, envoyerPourLus } from './donnees.js';
import { ChoixSiteTravail, useSiteTravail } from './SiteTravail.jsx';

// Livraison : les vêtements prêts retournent au poste ; un vêtement attitré repasse en service.
export default function Livraison() {
  const { organisation } = useOrganisation();
  const travail = useSiteTravail();
  const prets = useLocal(
    async () => (travail.siteId ? vetementsParStatut(organisation.id, ['pret'], travail.siteId) : []),
    [organisation.id, travail.siteId],
    [],
  );
  // Porteurs par matricule seulement (index local) : regroupement par poste du pompier attitré.
  const porteurs = useLocal(
    async () => {
      const ids = [...new Set(prets.map((v) => v.porteur_id).filter(Boolean))];
      return Object.fromEntries((await base.porteurs.bulkGet(ids)).filter(Boolean).map((p) => [p.id, p]));
    },
    [prets],
    {},
  );
  const [destination, setDestination] = useState('');
  const [resultat, setResultat] = useState(null);
  const [envoi, setEnvoi] = useState(false);


  const postes = travail.sites.filter((s) => s.actif && ['poste', 'magasin'].includes(s.type));
  const nomSite = (id) => travail.sites.find((s) => s.id === id)?.nom ?? 'Sans poste attitré';

  // Préparation : regroupement par poste du pompier attitré.
  const groupes = {};
  for (const v of prets) {
    const site = porteurs[v.porteur_id]?.site_id ?? '';
    (groupes[site] ??= []).push(v);
  }

  async function livrer(lus, site) {
    setEnvoi(true);
    try {
      const b = await envoyerPourLus(organisation.id, lus, (l) => evenement('livraison', l.vetementId, { siteId: site, lecteurId: l.lecture?.lecteur_id }));
      setResultat({ ...b, texte: `Livraison vers ${nomSite(site)}.` });
      return b.refuses;
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <section className="pile">
      <p>
        <Link to="/laverie">← Laverie</Link>
      </p>
      <h1>Livraison</h1>
      <ChoixSiteTravail travail={travail} />
      <CompteRendu resultat={resultat} />

      {travail.siteId && (
        <>
          <div className="carte">
            <h2>Prêts à livrer ({prets.length})</h2>
            {Object.entries(groupes).map(([site, vetements]) => (
              <div key={site || 'aucun'} className="groupe-livraison">
                <h3>
                  {nomSite(site)} ({vetements.length})
                </h3>
                <p className="texte-secondaire mono">
                  {vetements.map((v) => `${codeVisible(v)}${porteurs[v.porteur_id] ? ` (${porteurs[v.porteur_id].matricule})` : ''}`).join(' · ')}
                </p>
                {site && (
                  <button
                    type="button"
                    className="bouton"
                    disabled={envoi}
                    onClick={() => livrer(vetements.map((v) => ({ vetementId: v.id, vetement: v, lecture: { valeur: codeVisible(v) } })), site)}
                  >
                    Livrer ces {vetements.length} vêtement(s) à {nomSite(site)}
                  </button>
                )}
              </div>
            ))}
            {prets.length === 0 && <p className="texte-secondaire">Aucun vêtement prêt.</p>}
          </div>

          <div className="carte formulaire">
            <h2>Livrer par scan</h2>
            <label>
              <span>Poste de destination</span>
              <select value={destination} onChange={(e) => setDestination(e.target.value)}>
                <option value="">Choisir…</option>
                {postes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {destination && (
            <Rafale contexte={{ ecran: 'livraison' }} onValider={({ lus }) => livrer(lus, destination)} libelleValider={`Livrer à ${nomSite(destination)}`} />
          )}
        </>
      )}
      {!travail.siteId && <p className="message">Choisissez la laverie où vous travaillez.</p>}
    </section>
  );
}
