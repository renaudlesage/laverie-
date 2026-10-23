// Lecture CSV sans dépendance : séparateur ; , ou tabulation détecté sur l'en-tête,
// guillemets doubles, BOM d'Excel retiré.

export function detecterSeparateur(premiereLigne) {
  const candidats = [';', ',', '\t'];
  let meilleur = ';';
  let max = -1;
  for (const c of candidats) {
    const n = premiereLigne.split(c).length;
    if (n > max) {
      max = n;
      meilleur = c;
    }
  }
  return meilleur;
}

export function lireCsv(texte) {
  const contenu = texte.replace(/^﻿/, '');
  const finPremiereLigne = contenu.search(/\r?\n/);
  const separateur = detecterSeparateur(finPremiereLigne === -1 ? contenu : contenu.slice(0, finPremiereLigne));
  const lignes = [];
  let ligne = [];
  let champ = '';
  let entreGuillemets = false;

  for (let i = 0; i < contenu.length; i++) {
    const c = contenu[i];
    if (entreGuillemets) {
      if (c === '"' && contenu[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') {
        entreGuillemets = false;
      } else {
        champ += c;
      }
    } else if (c === '"') {
      entreGuillemets = true;
    } else if (c === separateur) {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && contenu[i + 1] === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else {
      champ += c;
    }
  }
  if (champ !== '' || ligne.length) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes.filter((l) => l.some((v) => v.trim() !== ''));
}

// « Prénom » → « prenom », « N° casier » → « n_casier »
export function normaliserEntete(entete) {
  return entete
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
