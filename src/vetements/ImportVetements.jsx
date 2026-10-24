import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { messageErreur } from '../lib/erreurs.js';
import { lireCsv, normaliserEntete } from '../lib/csv.js';
import { useOrganisation } from '../organisation/OrganisationProvider.jsx';
import { useLignes } from '../referentiels/useLignes.js';
import { nouvelId } from '../identification/codes.js';
import { normaliser } from '../identification/normalisation.js';
import { analyserImportVetements } from './importVetements.js';

const URL_PUBLIQUE = import.meta.env.VITE_URL_PUBLIQUE || window.location.origin;
const TAILLE_ENVOI = 200;
const COLONNES_CODES = { code_barres: 'code_barres', code_barre: 'code_barres', qr: 'qr', qr_code: 'qr', datamatrix: 'datamatrix', data_matrix: 'datamatrix', nfc: 'nfc', uid_nfc: 'nfc' };

async function lireTexte(fichier) {
  const octets = await fichier.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(octets);
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(octets) : utf8;
}

// Identifiants du fichier déjà actifs en base, interrogés par paquets (pas de lecture de toute la table).
async function identifiantsExistants(texte, organisationId) {
  const lignes = lireCsv(texte);
  const colonnes = (lignes[0] ?? []).map((e) => COLONNES_CODES[normaliserEntete(e)] ?? null);
  const valeurs = new Set();
  for (const l of lignes.slice(1)) {
    colonnes.forEach((technologie, i) => {
      if (!technologie || !l[i]?.trim()) return;
      const n = normaliser({ technologie, valeur_brute: l[i] }, { urlPublique: URL_PUBLIQUE });
      if (n) valeurs.add(n.valeur);
    });
  }
  const existants = new Set();
  const liste = [...valeurs];
  for (let i = 0; i < liste.length; i += 200) {
    const { data, error } = await supabase
      .from('identifiants')
      .select('technologie, valeur')
      .eq('organisation_id', organisationId)
      .eq('actif', true)
      .in('valeur', liste.slice(i, i + 200));
    if (error) throw error;
    for (const x of data) existants.add(`${x.technologie}|${x.valeur}`);
  }
  return existants;
}

export default function ImportVetements() {
  const { organisation } = useOrganisation();
  const { lignes: articles, chargement: chargementArticles } = useLignes('articles', { ordre: 'designation' });
  const { lignes: sites, chargement: chargementSites } = useLignes('sites', { ordre: 'nom' });
  const [fichier, setFichier] = useState(null); // { nom, texte, existants }
  const [envoi, setEnvoi] = useState(null); // { fait, total }
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const pret = !chargementArticles && !chargementSites;

  const rapport = useMemo(() => {
    if (!fichier || !pret) return null;
    const r = analyserImportVetements(fichier.texte, { articles, sites, identifiantsExistants: fichier.existants, urlPublique: URL_PUBLIQUE });
    // UUID d'événements attachés au fichier chargé, ligne par ligne : un renvoi après coupure
    // (ou un rapport recalculé) réutilise les mêmes et ne crée pas de doublon.
    r.aCreer = r.aCreer.map((l) => {
      if (!fichier.ids.has(l.ligne)) {
        fichier.ids.set(l.ligne, { evenement_id: nouvelId(), vetement_id: nouvelId(), identifiants: l.identifiants.map(() => nouvelId()) });
      }
      const ids = fichier.ids.get(l.ligne);
      return {
        ...l,
        evenement_id: ids.evenement_id,
        vetement_id: ids.vetement_id,
        identifiants: l.identifiants.map((i, n) => ({ ...i, evenement_id: (ids.identifiants[n] ??= nouvelId()) })),
      };
    });
    return r;
  }, [fichier, pret, articles, sites]);

  async function choisir(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    setResultat(null);
    setErreur(null);
    setFichier(null);
    if (!f) return;
    try {
      const texte = await lireTexte(f);
      setFichier({ nom: f.name, texte, existants: await identifiantsExistants(texte, organisation.id), ids: new Map() });
    } catch (err) {
      setErreur(messageErreur(err));
    }
  }

  async function importer() {
    const lignes = rapport.aCreer;
    const reponses = [];
    setEnvoi({ fait: 0, total: lignes.length });
    for (let i = 0; i < lignes.length; i += TAILLE_ENVOI) {
      const paquet = lignes.slice(i, i + TAILLE_ENVOI).map(({ ligne, evenement_id, vetement_id, article_id, taille, numero_serie, nominatif, site_id, mis_en_service_le, identifiants }) => ({
        ligne,
        evenement_id,
        vetement_id,
        article_id,
        taille,
        numero_serie,
        nominatif,
        site_id,
        mis_en_service_le,
        survenu_le: new Date().toISOString(),
        identifiants,
      }));
      const { data, error } = await supabase.rpc('importer_vetements', { org: organisation.id, lignes: paquet });
      if (error) {
        setErreur(`${messageErreur(error)} — ${reponses.length} ligne(s) traitée(s). Relancez l’import : les lignes déjà créées ne seront pas dupliquées.`);
        setEnvoi(null);
        setResultat(reponses.length ? reponses : null);
        return;
      }
      reponses.push(...data);
      setEnvoi({ fait: reponses.length, total: lignes.length });
    }
    setEnvoi(null);
    setResultat(reponses);
  }

  const bilan = resultat && {
    crees: resultat.filter((r) => r.statut === 'cree').length,
    deja: resultat.filter((r) => r.statut === 'doublon').length,
    rejetes: resultat.filter((r) => r.statut === 'rejete'),
  };

  return (
    <section className="carte pile">
      <div>
        <p className="etiquette">Reprise de l’existant</p>
        <h1>Importer des vêtements</h1>
      </div>
      <p>
        Fichier CSV (export Excel accepté). Colonnes reconnues : <strong>article</strong> (désignation ou référence d’un article actif,
        obligatoire), taille, n° de série, nominatif (oui / non), site, mise en service (JJ/MM/AAAA), et les codes déjà posés :{' '}
        <span className="mono">code_barres</span>, <span className="mono">qr</span>, <span className="mono">datamatrix</span>,{' '}
        <span className="mono">nfc</span>.
      </p>

      <label className="bouton">
        {pret ? 'Choisir un fichier' : 'Chargement…'}
        <input type="file" accept=".csv,text/csv,text/plain" onChange={choisir} hidden disabled={!pret || !!envoi} />
      </label>
      {fichier && <p className="texte-secondaire">{fichier.nom}</p>}
      {erreur && <p className="message message-erreur">{erreur}</p>}

      {rapport && !resultat && (
        <div className="rapport">
          <ul className="liste-compteurs">
            <li>
              <strong>{rapport.aCreer.length}</strong> à créer
            </li>
            <li>
              <strong>{rapport.doublons.length}</strong> doublon(s)
            </li>
            <li>
              <strong>{rapport.formats.length}</strong> format(s) non reconnu(s)
            </li>
            <li>
              <strong>{rapport.invalides.length}</strong> ligne(s) invalide(s)
            </li>
          </ul>
          {rapport.colonnesIgnorees.length > 0 && <p className="texte-secondaire">Colonnes ignorées : {rapport.colonnesIgnorees.join(', ')}</p>}
          {[
            ['Doublons', rapport.doublons.map((d) => `Ligne ${d.ligne} : ${d.valeur} ${d.motif}`)],
            ['Formats non reconnus', rapport.formats.map((d) => `Ligne ${d.ligne} : ${d.motif}`)],
            ['Lignes invalides', rapport.invalides.map((d) => `Ligne ${d.ligne} : ${d.motif}`)],
          ]
            .filter(([, l]) => l.length)
            .map(([titre, l]) => (
              <details key={titre}>
                <summary>
                  {titre} ({l.length})
                </summary>
                <ul>
                  {l.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </details>
            ))}
          <button type="button" className="bouton bouton-principal bouton-large" disabled={!rapport.aCreer.length || !!envoi} onClick={importer}>
            {envoi ? `Import… ${envoi.fait} / ${envoi.total}` : `Créer ${rapport.aCreer.length} vêtement(s)`}
          </button>
        </div>
      )}

      {bilan && (
        <div className="rapport">
          <p className="message">
            Import terminé : <strong>{bilan.crees}</strong> créé(s)
            {bilan.deja > 0 && `, ${bilan.deja} déjà importé(s)`}
            {bilan.rejetes.length > 0 && `, ${bilan.rejetes.length} refusé(s) par la base`}.
          </p>
          {bilan.rejetes.length > 0 && (
            <ul>
              {bilan.rejetes.map((r) => (
                <li key={r.ligne}>
                  Ligne {r.ligne} : {r.motif}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p>
        <Link to="/">← Accueil</Link>
      </p>
    </section>
  );
}
