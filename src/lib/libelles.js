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
