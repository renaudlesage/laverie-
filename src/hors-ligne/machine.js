// Règles du journal appliquées sur l'appareil, copie fidèle de la base (0008_journal.sql,
// 0009_laverie.sql) : transitions de statut, circuits, seuils, opérations sur les lots.
// La base revérifie tout à la réception ; un écart entre les deux devient un conflit.

export class RegleRefusee extends Error {
  constructor(message, code = '23514') {
    super(message);
    this.code = code;
  }
}

const CIRCUIT_LOCAL = 'LC001';

export function exigerStatut(actuel, admis, type) {
  if (!actuel || !admis.includes(actuel)) {
    throw new RegleRefusee(`Transition impossible : « ${type} » depuis le statut « ${actuel ?? 'aucun'} »`);
  }
}

const max = (a, b) => (!a ? b : !b ? a : new Date(a) >= new Date(b) ? a : b);

// État projeté d'un vêtement ; même calcul que prive.appliquer.
export function appliquer(e, type, { site = null, lot = null, quand, d = {}, nominatif = false }) {
  const r = { ...e, derniere_lecture_le: max(e.derniere_lecture_le, quand) };
  switch (type) {
    case 'attribution':
      exigerStatut(e.statut, ['en_stock'], type);
      return { ...r, statut: 'en_service', porteur_id: d.porteur_id ?? null, site_id: site ?? e.site_id };
    case 'restitution':
      exigerStatut(e.statut, ['en_service'], type);
      return { ...r, statut: 'en_stock', porteur_id: nominatif ? e.porteur_id : null, site_id: site ?? e.site_id };
    case 'contamination':
      exigerStatut(e.statut, ['en_service', 'en_stock', 'collecte', 'en_laverie'], type);
      return {
        ...r,
        statut: ['collecte', 'en_laverie'].includes(e.statut) ? 'en_laverie' : 'a_decontaminer',
        contamine: true,
        site_id: site ?? e.site_id,
      };
    case 'collecte':
      exigerStatut(e.statut, ['en_service', 'en_stock', 'a_decontaminer'], type);
      return { ...r, statut: 'collecte', lot_id: lot };
    case 'reception':
      exigerStatut(e.statut, ['collecte'], type);
      return { ...r, statut: 'en_laverie', site_id: site ?? e.site_id, lot_id: null };
    case 'ajout_lot':
      exigerStatut(e.statut, ['en_laverie'], type);
      return { ...r, statut: 'en_traitement', lot_id: lot };
    case 'retrait_lot':
      exigerStatut(e.statut, ['en_traitement'], type);
      return { ...r, statut: 'en_laverie', lot_id: null };
    case 'traitement':
      exigerStatut(e.statut, ['en_traitement'], type);
      return { ...r, statut: 'traite', lot_id: null, controle_renforce: false };
    case 'controle': {
      exigerStatut(e.statut, ['traite'], type);
      const statut = { conforme: 'pret', a_reparer: 'a_reparer', reforme: 'reforme' }[d.verdict];
      if (!statut) throw new RegleRefusee('Contrôle : verdict attendu conforme, a_reparer ou reforme');
      if (d.verdict !== 'conforme') return { ...r, statut };
      return { ...r, statut, controle_renforce: !!d.renforce, contamine: d.decontamine ? false : e.contamine };
    }
    case 'reparation':
      exigerStatut(e.statut, ['a_reparer'], type);
      return { ...r, statut: 'traite' };
    case 'livraison':
      exigerStatut(e.statut, ['pret'], type);
      return { ...r, statut: e.porteur_id ? 'en_service' : 'en_stock', site_id: site ?? e.site_id };
    case 'vu_en_inventaire':
      return { ...r, site_id: site ?? e.site_id };
    case 'perte':
      exigerStatut(e.statut, ['en_stock', 'en_service', 'a_decontaminer', 'collecte', 'en_laverie', 'en_traitement', 'traite', 'a_reparer', 'pret'], type);
      return { ...r, statut: 'perdu' };
    case 'retrouve':
      exigerStatut(e.statut, ['perdu'], type);
      return { ...r, statut: 'en_stock', site_id: site ?? e.site_id };
    case 'reforme':
      exigerStatut(e.statut, ['en_stock', 'en_service', 'a_decontaminer', 'collecte', 'en_laverie', 'en_traitement', 'traite', 'a_reparer', 'pret', 'perdu'], type);
      return { ...r, statut: 'reforme', porteur_id: null, lot_id: null };
    default:
      throw new RegleRefusee(`Événement « ${type} » sans effet de statut`);
  }
}

// Limite de passages atteinte sur un traitement, ou âge maximal dépassé (prive.seuil_atteint).
//   compteurs : [{ traitement_id, passages }] ; limites : { traitement_id: limite } (vêtement > article)
export function seuilAtteint({ compteurs = [], limites = {}, dureeVieMois = null, misEnServiceLe = null }, aujourdhui = new Date()) {
  if (compteurs.some((c) => limites[c.traitement_id] && c.passages >= limites[c.traitement_id])) return true;
  if (!dureeVieMois || !misEnServiceLe) return false;
  const fin = new Date(misEnServiceLe);
  fin.setMonth(fin.getMonth() + dureeVieMois);
  return fin < new Date(aujourdhui.toISOString().slice(0, 10));
}

export function exigerCircuit(v, l) {
  if (!!v.contamine !== (l.circuit === 'contamine')) {
    throw new RegleRefusee(
      `Mélange de circuits : vêtement ${v.contamine ? 'contaminé' : 'standard'} dans un ${l.type === 'sac_collecte' ? 'sac' : 'lot'} du circuit ${l.circuit}`,
      CIRCUIT_LOCAL,
    );
  }
}

const TYPES_LAVERIE = ['laverie_interne', 'laverie_externe'];

// Contrôles faits à l'ingestion (prive.ingerer_statut), sur les données de l'index local.
// Une donnée de référence absente de l'index (porteur, site) n'est pas bloquante : la base tranche.
//   ctx : { v, lot, lotDuVetement, site, porteur, seuil }
// Renvoie { site, lot, d } tels que la base les enregistrera, puis l'état projeté.
export function verifier(ev, ctx) {
  const { v } = ctx;
  let site = ev.site_id ?? null;
  let lot = ev.lot_id ?? null;
  let d = ev.donnees ?? {};
  switch (ev.type) {
    case 'attribution':
      if (ctx.porteur && !ctx.porteur.actif) throw new RegleRefusee('Porteur inconnu ou inactif');
      if (ctx.seuil && !v.controle_renforce) {
        throw new RegleRefusee('Seuil atteint : contrôle renforcé ou réforme nécessaire avant attribution');
      }
      break;
    case 'reforme':
      if (!d.motif?.trim()) throw new RegleRefusee('Motif de réforme obligatoire');
      break;
    case 'collecte': {
      const l = ctx.lot;
      if (!l || l.type !== 'sac_collecte' || l.statut !== 'ouvert') throw new RegleRefusee('Sac de collecte ouvert attendu');
      exigerCircuit(v, l);
      site = null;
      break;
    }
    case 'reception': {
      if (ctx.site && !TYPES_LAVERIE.includes(ctx.site.type)) throw new RegleRefusee('Site de laverie attendu');
      if (!site) throw new RegleRefusee('Site de laverie attendu');
      const l = ctx.lotDuVetement;
      if (!l || l.statut !== 'expedie') throw new RegleRefusee('Réception : le sac de ce vêtement n’a pas été expédié');
      lot = null;
      break;
    }
    case 'ajout_lot': {
      const l = ctx.lot;
      if (!l || l.type !== 'traitement' || l.statut !== 'ouvert') throw new RegleRefusee('Lot de traitement ouvert attendu');
      if (l.site_id !== v.site_id) throw new RegleRefusee('Le vêtement n’est pas réceptionné sur le site de ce lot');
      exigerCircuit(v, l);
      site = null;
      break;
    }
    case 'retrait_lot': {
      const l = ctx.lotDuVetement;
      if (!l || l.statut !== 'ouvert') throw new RegleRefusee('Retrait impossible : le lot n’est plus ouvert');
      lot = l.id;
      site = null;
      break;
    }
    case 'controle':
      if (['a_reparer', 'reforme'].includes(d.verdict) && !d.motif?.trim()) {
        throw new RegleRefusee('Motif obligatoire pour un vêtement à réparer ou à réformer');
      }
      if (d.verdict === 'conforme' && (v.contamine || ctx.seuil) && !d.renforce) {
        throw new RegleRefusee(
          `Contrôle renforcé obligatoire : vêtement ${v.contamine ? 'contaminé' : 'à sa limite de passages ou d’âge'}`,
        );
      }
      // Un vêtement contaminé n'entre que dans des lots contaminés : son dernier traitement l'était.
      d = { ...d, decontamine: !!v.contamine };
      site = null;
      lot = null;
      break;
    case 'livraison':
      if (!site) throw new RegleRefusee('Livraison : site de destination attendu');
      if (ctx.seuil && !v.controle_renforce) {
        throw new RegleRefusee('Seuil atteint : contrôle renforcé ou réforme nécessaire avant livraison');
      }
      lot = null;
      break;
    default:
      break;
  }
  const etat = appliquer(v, ev.type, { site, lot, quand: ev.survenu_le, d, nominatif: v.nominatif });
  return { site, lot, d, etat };
}

// Opérations sur les lots (prive.operer_lot), hors contrôle des rôles (fait par la base).
//   ctx : { lot, sac, tourneeEnCours, siteDestination, site, traitement, contenu }
// Renvoie { doublon } ou { lot: nouvel état du lot, vetements: [nouveaux états], passages: [{ vetement_id, traitement_id }] }.
export function operer(op, ctx) {
  const l = ctx.lot;
  const quand = op.survenu_le;
  switch (op.type) {
    case 'ouvrir_sac': {
      if (l) return { doublon: true };
      if (!ctx.sac || !ctx.sac.actif) throw new RegleRefusee('Sac inconnu ou inactif');
      if (ctx.tourneeEnCours) throw new RegleRefusee(`Le sac « ${ctx.sac.nom} » a déjà une tournée en cours`);
      return {
        lot: {
          id: op.lot_id, organisation_id: ctx.sac.organisation_id, type: 'sac_collecte', circuit: ctx.sac.circuit,
          site_id: op.site_id ?? ctx.sac.site_id ?? null, sac_id: ctx.sac.id, statut: 'ouvert', ouvert_le: quand,
        },
      };
    }
    case 'expedier_sac':
      if (!l || l.type !== 'sac_collecte') throw new RegleRefusee('Sac de collecte inconnu');
      if (['expedie', 'receptionne'].includes(l.statut)) return { doublon: true };
      if (!ctx.siteDestination || !TYPES_LAVERIE.includes(ctx.siteDestination.type)) {
        throw new RegleRefusee('Expédition : laverie de destination attendue');
      }
      return {
        lot: {
          ...l, statut: 'expedie', site_destination_id: ctx.siteDestination.id,
          quantite_attendue: ctx.contenu.filter((v) => v.statut === 'collecte').length,
        },
      };
    case 'receptionner_sac':
      if (!l || l.type !== 'sac_collecte') throw new RegleRefusee('Sac de collecte inconnu');
      if (l.statut === 'receptionne') return { doublon: true };
      if (l.statut !== 'expedie') throw new RegleRefusee('Le sac n’a pas été expédié');
      return { lot: { ...l, statut: 'receptionne', cloture_le: quand } };
    case 'ouvrir_lot':
      if (l) return { doublon: true };
      if (!ctx.site || !TYPES_LAVERIE.includes(ctx.site.type)) throw new RegleRefusee('Site de laverie attendu');
      if (!ctx.traitement || !ctx.traitement.actif) throw new RegleRefusee('Traitement inconnu ou inactif');
      if (ctx.traitement.circuit !== 'les_deux' && ctx.traitement.circuit !== (op.circuit ?? 'standard')) {
        throw new RegleRefusee('Traitement incompatible avec le circuit du lot');
      }
      return {
        lot: {
          id: op.lot_id, organisation_id: ctx.site.organisation_id, type: 'traitement', circuit: op.circuit ?? 'standard',
          site_id: ctx.site.id, traitement_id: ctx.traitement.id, programme: op.programme?.trim() || null,
          machine: op.machine?.trim() || null, statut: 'ouvert', ouvert_le: quand,
        },
      };
    case 'cloturer_lot':
    case 'avorter_lot': {
      if (!l || l.type !== 'traitement') throw new RegleRefusee('Lot de traitement inconnu');
      if (['cloture', 'avorte'].includes(l.statut)) return { doublon: true };
      const cloture = op.type === 'cloturer_lot';
      const dans = ctx.contenu.filter((v) => v.statut === 'en_traitement');
      return {
        lot: { ...l, statut: cloture ? 'cloture' : 'avorte', cloture_le: quand },
        vetements: dans.map((v) => appliquer(v, cloture ? 'traitement' : 'retrait_lot', { lot: l.id, quand })),
        passages: cloture ? dans.map((v) => ({ vetement_id: v.id, traitement_id: l.traitement_id })) : [],
      };
    }
    default:
      throw new RegleRefusee(`Opération inconnue : ${op.type}`);
  }
}
