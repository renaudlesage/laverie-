// Libellés français des valeurs d'enum de la base.

export const ROLES = {
  admin: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  porteur: 'Porteur',
  operateur_laverie: 'Opérateur laverie',
  laverie_externe: 'Laverie externe',
  auditeur: 'Auditeur',
};

export const TYPES_SITE = {
  poste: 'Poste',
  magasin: 'Magasin',
  laverie_interne: 'Laverie interne',
  laverie_externe: 'Laverie externe',
};

export const CIRCUITS_TRAITEMENT = {
  standard: 'Standard',
  contamine: 'Contaminé',
  les_deux: 'Les deux circuits',
};

export const TECHNOLOGIES = {
  code_barres: 'Code-barres',
  qr: 'QR',
  datamatrix: 'DataMatrix',
  nfc: 'NFC',
  uhf: 'RFID UHF',
};

export const TYPES_LECTEUR = {
  camera: 'Caméra',
  clavier: 'Douchette / lecteur USB (clavier)',
  nfc_web: 'NFC du téléphone',
  passerelle_uhf: 'Passerelle UHF (V2)',
  portique: 'Portique (V3)',
};

export const MODES_LECTEUR = {
  unitaire: 'Unitaire',
  masse: 'En masse',
};

export function options(libelles) {
  return Object.entries(libelles).map(([valeur, libelle]) => ({ valeur, libelle }));
}

export const STATUTS_VETEMENT = {
  en_stock: 'En stock',
  en_service: 'En service',
  a_decontaminer: 'À décontaminer',
  collecte: 'Collecté',
  en_laverie: 'En laverie',
  en_traitement: 'En traitement',
  traite: 'Traité',
  a_reparer: 'À réparer',
  pret: 'Prêt',
  reforme: 'Réformé',
  perdu: 'Perdu',
};

// Classe d'état Eventware associée à chaque statut (sens fixe, jamais décoratif).
export const ETAT_STATUT = {
  en_stock: 'ok',
  en_service: 'ok',
  pret: 'ok',
  a_decontaminer: 'chaud',
  a_reparer: 'veille',
  collecte: 'info',
  en_laverie: 'info',
  en_traitement: 'info',
  traite: 'veille',
  reforme: 'froid',
  perdu: 'chaud',
};
