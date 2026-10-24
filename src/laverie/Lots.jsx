import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { base } from '../hors-ligne/base.js';
import { lignesOrganisation, useLocal } from '../hors-ligne/local.js';
import { nouvelId } from '../identification/codes.js';
import { operation, operer } from '../journal/journal.js';
import CompteRendu from './Envoi.jsx';
import { ChoixSiteTravail, useSiteTravail } from './SiteTravail.jsx';

const STATUTS_LOT = { ouvert: 'Ouvert', cloture: 'Clôturé', avorte: 'Avorté' };

// Lots de traitement de la laverie de travail : ouverts, puis derniers clôturés.
export default function Lots() {
  const { organisation } = useOrganisation();
  const navigate = useNavigate();
  const travail = useSiteTravail();
  const traitements = useLocal(
    async () =>
      (await lignesOrganisation('traitements', organisation.id)).sort(
        (a, b) => a.cree_le.localeCompare(b.cree_le) || a.libelle.localeCompare(b.libelle, 'fr'),
      ),
    [organisation.id],
    [],
  );
  const [nouveau, setNouveau] = useState(null);
  const [resultat, setResultat] = useState(null);

  // Lots de la laverie de travail : ouverts d'abord, puis les plus récents.
  const lots = useLocal(
    async () => {
      if (!travail.siteId) return [];
      const liste = await base.lots
        .where('[organisation_id+type]')
        .equals([organisation.id, 'traitement'])
        .filter((l) => l.site_id === travail.siteId)
        .toArray();
      liste.sort((a, b) => (b.statut === 'ouvert') - (a.statut === 'ouvert') || (b.ouvert_le > a.ouvert_le ? 1 : -1));
      const libelles = new Map((await base.traitements.bulkGet(liste.map((l) => l.traitement_id))).filter(Boolean).map((t) => [t.id, t.libelle]));
      return liste.slice(0, 30).map((l) => ({ ...l, traitement: { libelle: libelles.get(l.traitement_id) } }));
    },
    [organisation.id, travail.siteId],
    [],
  );

  const compatibles = nouveau
    ? traitements.filter((t) => t.actif && (t.circuit === 'les_deux' || t.circuit === nouveau.circuit))
    : [];

  async function ouvrir(e) {
    e.preventDefault();
    const id = nouvelId();
    const [r] = await operer(organisation.id, [
      operation('ouvrir_lot', id, { ...nouveau, site_id: travail.siteId }),
    ]);
    if (r.statut === 'rejete') setResultat({ texte: r.motif, rejets: [] });
    else navigate(`/laverie/lots/${id}`);
  }

  return (
    <section className="pile">
      <p>
        <Link to="/laverie">← Laverie</Link>
      </p>
      <div className="entete-section">
        <h1>Lots de traitement</h1>
        {travail.siteId && !nouveau && (
          <button type="button" className="bouton bouton-principal" onClick={() => setNouveau({ circuit: 'standard', traitement_id: '', programme: '', machine: '' })}>
            Nouveau lot
          </button>
        )}
      </div>
      <ChoixSiteTravail travail={travail} />
      <CompteRendu resultat={resultat} />

      {nouveau && (
        <form className={`carte formulaire ${nouveau.circuit === 'contamine' ? 'carte-alerte etat-chaud' : ''}`} onSubmit={ouvrir}>
          <h2>Nouveau lot</h2>
          <fieldset className="choix-radio">
            <legend>Circuit</legend>
            {[
              ['standard', 'Standard'],
              ['contamine', 'Contaminé'],
            ].map(([v, l]) => (
              <label key={v} className="champ-case">
                <input type="radio" name="circuit" checked={nouveau.circuit === v} onChange={() => setNouveau({ ...nouveau, circuit: v, traitement_id: '' })} />
                <span>{l}</span>
              </label>
            ))}
          </fieldset>
          <label>
            <span>
              Traitement<span className="requis"> *</span>
            </span>
            <select required value={nouveau.traitement_id} onChange={(e) => setNouveau({ ...nouveau, traitement_id: e.target.value })}>
              <option value="">Choisir…</option>
              {compatibles.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.libelle}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Programme</span>
            <input value={nouveau.programme} onChange={(e) => setNouveau({ ...nouveau, programme: e.target.value })} placeholder="Ex. 60 °C" />
          </label>
          <label>
            <span>Machine</span>
            <input value={nouveau.machine} onChange={(e) => setNouveau({ ...nouveau, machine: e.target.value })} placeholder="Ex. M2" />
          </label>
          <div className="rangee-actions">
            <button type="submit" className="bouton bouton-principal">
              Ouvrir le lot
            </button>
            <button type="button" className="bouton" onClick={() => setNouveau(null)}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {!travail.siteId && <p className="message">Choisissez la laverie où vous travaillez.</p>}
      <ul className="liste">
        {lots.map((l) => (
          <li key={l.id}>
            <Link to={`/laverie/lots/${l.id}`} className={`ligne-liste ${l.circuit === 'contamine' ? 'ligne-contaminee' : ''}`}>
              <span className="ligne-titre">
                {l.traitement?.libelle}
                {l.circuit === 'contamine' && <span className="jeton-etat etat-chaud">Contaminé</span>}
                <span className={`badge ${l.statut === 'ouvert' ? 'badge-veille' : l.statut === 'cloture' ? 'badge-ok' : ''}`}>{STATUTS_LOT[l.statut]}</span>
              </span>
              <span className="ligne-detail">
                {[l.programme, l.machine, new Date(l.ouvert_le).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' })].filter(Boolean).join(' · ')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
