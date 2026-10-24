import { Link } from 'react-router-dom';
import { TECHNOLOGIES } from '../lib/libelles.js';
import { useDroits } from '../organisation/useDroits.js';

// Identifiant inconnu (ou ambigu) en mode unitaire : jamais perdu, l'enrôlement est proposé.
export default function ResultatInconnu({ resultat, lecture, onFermer }) {
  const { enrole } = useDroits();

  if (resultat.statut === 'ambigu') {
    return (
      <section className="carte carte-alerte etat-veille">
        <h2>Plusieurs vêtements portent ce code</h2>
        <p>
          <span className="mono">{lecture.valeur}</span> : choisissez le bon vêtement.
        </p>
        <ul className="liste">
          {resultat.correspondances.map((c) => (
            <li key={c.vetement_id}>
              <Link to={`/vetements/${c.vetement_id}`} className="ligne-liste">
                <span className="ligne-titre">{c.vetement?.article?.designation ?? 'Vêtement'}</span>
                <span className="ligne-detail">
                  {TECHNOLOGIES[c.technologie]}
                  {c.vetement?.numero_serie ? ` · n° ${c.vetement.numero_serie}` : ''}
                  {c.vetement?.taille ? ` · taille ${c.vetement.taille}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <button type="button" className="bouton" onClick={onFermer}>
          Fermer
        </button>
      </section>
    );
  }

  const parametres = new URLSearchParams({ valeur: lecture.valeur });
  if (lecture.technologie) parametres.set('technologie', lecture.technologie);

  return (
    <section className="carte carte-alerte etat-veille">
      <h2>Identifiant inconnu</h2>
      <p>
        <span className="mono">{lecture.valeur}</span>
        <br />
        <span className="texte-secondaire">{TECHNOLOGIES[lecture.technologie] ?? 'Technologie non précisée'} · lecture enregistrée</span>
      </p>
      {enrole ? (
        <div className="rangee-actions">
          <Link to={`/enrolement?${parametres}`} className="bouton bouton-principal">
            Enrôler ce vêtement
          </Link>
          <button type="button" className="bouton" onClick={onFermer}>
            Ignorer
          </button>
        </div>
      ) : (
        <>
          <p className="texte-secondaire">Ce code n'est rattaché à aucun vêtement que vous pouvez voir. Signalez-le à votre gestionnaire.</p>
          <button type="button" className="bouton" onClick={onFermer}>
            Fermer
          </button>
        </>
      )}
    </section>
  );
}
