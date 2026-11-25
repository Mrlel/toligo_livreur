import { api } from '../../api/client';
import { lireBooleen, lireDate, lireEntier, lireListe, lireNombre, lireObjet } from '../../utils/lecture';

/**
 * Tournées de ramassage (routes /livreur/tournees).
 *
 * Le gestionnaire de la station planifie la tournée : station A, chauffeur,
 * aides, véhicule de la station, début et fin prévus. Seul le chauffeur la
 * pilote ; ses aides la voient (`monRole` = 'aide') sans boutons d'action.
 * Le chauffeur ne scanne pas les colis :
 * 1. il la démarre : le système y ajoute les box qui contiennent un colis ;
 * 2. à chaque site : il prend les colis dans les box (ouverts depuis
 *    l'application TTLock de l'entrepôt, pas depuis cette application), ou
 *    signale une anomalie sur un box, puis appuie sur « Fin du passage » :
 *    tous les colis des box du site passent dans le camion (fin-de-passage) ;
 * 3. à la station A : « Terminer la tournée » y dépose tous les colis du
 *    camion et clôt la tournée (terminer).
 */

/** Membre de l'équipe : chauffeur ou aide. */
function versMembre(json) {
  return { id: json.id ?? '', nomComplet: json.nom_complet ?? '', telephone: json.telephone ?? '' };
}

function versStation(json) {
  if (!json) return null;
  const station = lireObjet(json);
  return {
    id: station.id ?? '',
    nom: station.nom ?? '',
    adresse: station.adresse ?? '',
    repere: station.repere ?? null,
    latitude: lireNombre(station.latitude),
    longitude: lireNombre(station.longitude),
  };
}

/** Passage à un box : son état et les colis qu'il reste à y prendre. */
function versPassage(json) {
  const box = json.box ? lireObjet(json.box) : null;
  return {
    id: json.id ?? '',
    ordre: lireEntier(json.ordre) ?? 0,
    etat: json.etat ?? 'a_visiter', // 'a_visiter' | 'visite' | 'anomalie'
    passeLe: lireDate(json.passe_le),
    commentaire: json.commentaire ?? null,
    box: box && {
      id: box.id ?? '',
      numero: box.numero ?? '',
      adresse: box.adresse ?? '',
      latitude: lireNombre(box.latitude),
      longitude: lireNombre(box.longitude),
    },
    colisAPrendre: lireListe(json.colis_a_prendre).map((colis) => ({
      codeSuivi: colis.code_suivi ?? '',
      format: colis.format ?? null,
    })),
  };
}

/** Tournée renvoyée par l'API (TourneeResource). */
function versTournee(json) {
  const vehicule = json.vehicule ? lireObjet(json.vehicule) : null;
  return {
    id: json.id ?? '',
    statut: json.statut ?? 'planifiee',
    planifieeLe: lireDate(json.planifiee_le),
    finPrevueLe: lireDate(json.fin_prevue_le),
    demarreeLe: lireDate(json.demarree_le),
    termineeLe: lireDate(json.terminee_le),
    station: versStation(json.station),
    // Sites choisis à la planification ; liste vide = tous ceux de la station.
    // null dans la liste des tournées : l'API ne les y charge pas.
    entrepots: Array.isArray(json.entrepots)
      ? lireListe(json.entrepots).map((site) => ({ id: site.id ?? '', nom: site.nom ?? '', adresse: site.adresse ?? '' }))
      : null,
    vehicule: vehicule && { type: vehicule.type ?? 'autre', immatriculation: vehicule.immatriculation ?? '', capaciteKg: lireNombre(vehicule.capacite_kg) },
    // 'chauffeur' : il pilote la tournée ; 'aide' : il la suit sans agir.
    monRole: json.mon_role === 'aide' ? 'aide' : 'chauffeur',
    chauffeur: json.chauffeur ? versMembre(lireObjet(json.chauffeur)) : null,
    aides: lireListe(json.aides).map(versMembre),
    nbBox: lireEntier(json.nb_box),
    // Arrêts : les box regroupés par site, dans l'ordre de passage.
    // `passageTermine` : plus aucun box du site à visiter.
    arrets: lireListe(json.arrets).map((arret) => {
      const site = arret.entrepot ? lireObjet(arret.entrepot) : null;
      return {
        entrepot: site && {
          id: site.id ?? '',
          nom: site.nom ?? '',
          adresse: site.adresse ?? '',
          latitude: lireNombre(site.latitude),
          longitude: lireNombre(site.longitude),
        },
        passageTermine: lireBooleen(arret.passage_termine),
        passages: lireListe(arret.passages).map(versPassage),
      };
    }),
    passages: lireListe(json.passages).map(versPassage),
  };
}

/** Détail : la tournée et les colis à bord (pris dans les box, pas encore déposés). */
function versDetail(json) {
  return {
    tournee: versTournee(lireObjet(json.tournee)),
    aBord: lireListe(json.a_bord).map((colis) => ({ codeSuivi: colis.code_suivi ?? '', format: colis.format ?? null })),
  };
}

/** Tournées prévues ou en cours du chauffeur. */
export async function listerTournees() {
  return lireListe(await api.get('/livreur/tournees')).map(versTournee);
}

export async function detailTournee(id) {
  return versDetail(lireObjet(await api.get(`/livreur/tournees/${id}`)));
}

export async function demarrerTournee(id) {
  return versDetail(lireObjet(await api.post(`/livreur/tournees/${id}/demarrer`)));
}

export function signalerAnomalie(id, passageId, commentaire) {
  return api.post(`/livreur/tournees/${id}/passages/${passageId}/anomalie`, { commentaire });
}

/**
 * « Fin du passage » à un site : tous les colis de ses box passent dans le
 * camion, sauf ceux des box signalés en anomalie.
 */
export async function terminerPassage(id, entrepotId) {
  return versDetail(lireObjet(await api.post(`/livreur/tournees/${id}/entrepots/${entrepotId}/fin-de-passage`)));
}

/** À la station A : dépose tous les colis du camion et clôt la tournée. */
export async function terminerTournee(id) {
  return versDetail(lireObjet(await api.post(`/livreur/tournees/${id}/terminer`)));
}

const STATUTS_TOURNEE = {
  planifiee: { libelle: 'Prévue', ton: 'sombre' },
  en_cours: { libelle: 'En cours', ton: 'vive' },
  terminee: { libelle: 'Terminée', ton: 'succes' },
  annulee: { libelle: 'Annulée', ton: 'neutre' },
};

export function infosStatutTournee(statut) {
  return STATUTS_TOURNEE[statut] ?? { libelle: statut, ton: 'neutre' };
}

const ETATS_PASSAGE = {
  a_visiter: { libelle: 'À visiter', ton: 'neutre' },
  visite: { libelle: 'Vidé', ton: 'succes' },
  anomalie: { libelle: 'Anomalie', ton: 'erreur' },
};

export function infosEtatPassage(etat) {
  return ETATS_PASSAGE[etat] ?? { libelle: etat, ton: 'neutre' };
}
