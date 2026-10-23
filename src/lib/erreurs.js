// Contraintes CHECK nommées par Postgres (<table>_<colonne>_check) : message par contrainte.
const CONTRAINTES = {
  traitements_code_check: 'Code : lettres minuscules, chiffres et « _ » uniquement, en commençant par une lettre.',
  invitations_email_check: 'Adresse e-mail invalide.',
  articles_duree_vie_mois_check: 'La durée de vie doit être un nombre de mois positif.',
  articles_limites_limite_check: 'Une limite doit être un nombre positif.',
  articles_limites_seuil_alerte_pct_check: 'Le seuil d’alerte doit être compris entre 1 et 100 %.',
  vetements_limites_limite_check: 'Une limite doit être un nombre positif.',
  membres_laverie_externe_site_check: 'Un membre « Laverie externe » doit être rattaché à un site.',
  invitations_laverie_externe_site_check: 'Un membre « Laverie externe » doit être rattaché à un site.',
};

// Message lisible à partir d'une erreur Supabase / PostgREST / Postgres.
export function messageErreur(erreur) {
  if (!erreur) return null;
  switch (erreur.code) {
    case '23505':
      return 'Cette valeur existe déjà.';
    case '23503':
      return erreur.message?.includes('delete')
        ? 'Élément utilisé ailleurs : désactivez-le plutôt que de le supprimer.'
        : 'Référence invalide.';
    case '23514': {
      const contrainte = erreur.message?.match(/constraint "([^"]+)"/)?.[1];
      if (contrainte) return CONTRAINTES[contrainte] ?? 'Valeur refusée par la base.';
      // Messages des déclencheurs, déjà rédigés en français.
      return erreur.message;
    }
    case 'P0001':
      return erreur.message;
    case '42501':
      return erreur.message?.startsWith('Réservé') ? erreur.message : "Vous n'avez pas les droits pour cette action.";
    case '23502':
      return 'Un champ obligatoire est vide.';
    default:
      if (erreur.message === 'Failed to fetch' || erreur.message?.includes('NetworkError')) {
        return 'Connexion impossible. Vérifiez le réseau et réessayez.';
      }
      return erreur.message ?? 'Erreur inattendue.';
  }
}
