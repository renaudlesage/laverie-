import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { analyserImportPorteurs } from './importPorteurs.js';
import { useLignes } from './useLignes.js';

export default function ImportPorteurs() {
  const { organisation } = useOrganisation();
  const { lignes: sites, chargement: chargementSites } = useLignes('sites', { ordre: 'nom' });
  const [fichier, setFichier] = useState(null); // { texte, existants }
  const [nomFichier, setNomFichier] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);

  // Recalculé si les sites arrivent après le choix du fichier.
  const rapport = useMemo(
    () => (fichier && !chargementSites ? analyserImportPorteurs(fichier.texte, sites, fichier.existants) : null),
    [fichier, sites, chargementSites],
  );

  async function choisirFichier(e) {
    const choisi = e.target.files?.[0];
    e.target.value = '';
    setResultat(null);
    setFichier(null);
    if (!choisi) return;
    setNomFichier(choisi.name);
    const texte = await lireTexte(choisi);
    const { data, error } = await supabase
      .from('porteurs')
      .select('matricule')
      .eq('organisation_id', organisation.id);
    if (error) {
      setResultat({ type: 'erreur', texte: messageErreur(error) });
      return;
    }
    setFichier({ texte, existants: new Set(data.map((p) => p.matricule)) });
  }

  async function importer() {
    setEnvoi(true);
    const lignes = [...rapport.aCreer, ...rapport.aMettreAJour].map((p) => ({ ...p, organisation_id: organisation.id }));
    const { error } = await supabase.from('porteurs').upsert(lignes, { onConflict: 'organisation_id,matricule' });
    setEnvoi(false);
    if (error) {
      setResultat({ type: 'erreur', texte: messageErreur(error) });
      return;
    }
    setResultat({
      type: 'info',
      texte: `Import terminé : ${rapport.aCreer.length} créé(s), ${rapport.aMettreAJour.length} mis à jour.`,
    });
    setFichier(null);
  }

  return (
    <section className="carte">
      <h1>Importer des porteurs</h1>
      <p>
        Fichier CSV (export Excel accepté, séparateur « ; » ou « , »). Première ligne : en-têtes. Colonnes reconnues :{' '}
        <strong>matricule</strong> (obligatoire), nom, prénom, casier, site (nom exact d'un site existant).
      </p>
      <p className="texte-secondaire">
        Un matricule déjà présent met à jour la fiche ; une colonne absente du fichier ne modifie rien.
      </p>

      <label className="bouton">
        {chargementSites ? 'Chargement…' : 'Choisir un fichier'}
        <input type="file" accept=".csv,text/csv,text/plain" onChange={choisirFichier} hidden disabled={chargementSites} />
      </label>
      {nomFichier && <p className="texte-secondaire">{nomFichier}</p>}

      {rapport && (
        <div className="rapport">
          <ul className="liste-compteurs">
            <li>
              <strong>{rapport.aCreer.length}</strong> à créer
            </li>
            <li>
              <strong>{rapport.aMettreAJour.length}</strong> à mettre à jour
            </li>
            <li>
              <strong>{rapport.doublons.length}</strong> doublon(s) ignoré(s)
            </li>
            <li>
              <strong>{rapport.invalides.length}</strong> ligne(s) invalide(s)
            </li>
          </ul>
          {rapport.colonnesIgnorees.length > 0 && (
            <p className="texte-secondaire">Colonnes ignorées : {rapport.colonnesIgnorees.join(', ')}</p>
          )}
          {rapport.invalides.length > 0 && (
            <details open>
              <summary>Lignes invalides</summary>
              <ul>
                {rapport.invalides.map((l) => (
                  <li key={l.ligne}>
                    Ligne {l.ligne} : {l.motif}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {rapport.doublons.length > 0 && (
            <details>
              <summary>Doublons</summary>
              <ul>
                {rapport.doublons.map((d) => (
                  <li key={d.ligne}>
                    Ligne {d.ligne} : matricule {d.matricule} déjà présent ligne {d.premiere}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="rangee-actions">
            <button
              type="button"
              className="bouton bouton-principal"
              disabled={envoi || rapport.aCreer.length + rapport.aMettreAJour.length === 0}
              onClick={importer}
            >
              {envoi ? 'Import…' : 'Importer les lignes valides'}
            </button>
          </div>
        </div>
      )}

      {resultat && <p className={`message message-${resultat.type}`}>{resultat.texte}</p>}
      <p>
        <Link to="/parametres/porteurs">← Retour aux porteurs</Link>
      </p>
    </section>
  );
}

// Excel enregistre souvent en Windows-1252 : repli si l'UTF-8 contient des caractères invalides.
async function lireTexte(fichier) {
  const octets = await fichier.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(octets);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(octets) : utf8;
}
