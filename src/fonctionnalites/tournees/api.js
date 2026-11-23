import { api } from '../../api/client';
import { lireDate, lireEntier, lireListe, lireNombre, lireObjet } from '../../utils/lecture';

/**
 * Tournées de ramassage, côté chauffeur (routes /livreur/tournees).
 *
 * L'administration crée la tournée (station A, chauffeur, camion, date). Le
 * chauffeur :
 * 1. la démarre : le système y ajoute les box qui contiennent un colis ;
 * 2. à chaque box : l'ouvre à distance, scanne chaque colis qu'il prend
 *    (ramassages), ou signale une anomalie ;
 * 3. à la station A : scanne chaque colis qu'il dépose (depots) ;
 * 4. termine la tournée.
 */

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
    demarreeLe: lireDate(json.demarree_le),
    termineeLe: lireDate(json.terminee_le),
    station: versStation(json.station),
    // Sites choisis à la planification ; liste vide = tous ceux de la station.
    // null dans la liste des tournées : l'API ne les y charge pas.
    entrepots: Array.isArray(json.entrepots)
      ? lireListe(json.entrepots).map((site) => ({ id: site.id ?? '', nom: site.nom ?? '', adresse: site.adresse ?? '' }))
      : null,
    vehicule: vehicule && { type: vehicule.type ?? 'autre', immatriculation: vehicule.immatriculation ?? '' },
    nbBox: lireEntier(json.nb_box),
    // Arrêts : les box regroupés par site, dans l'ordre de passage.
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

/** Ouvre le box à distance (passerelle TTLock). Le serveur répond 502 si le box ne répond pas. */
export function ouvrirBox(id, passageId) {
  return api.post(`/livreur/tournees/${id}/passages/${passageId}/ouvrir`);
}

export function signalerAnomalie(id, passageId, commentaire) {
  return api.post(`/livreur/tournees/${id}/passages/${passageId}/anomalie`, { commentaire });
}

/** Colis pris dans un box. */
export function scannerRamassage(id, codeSuivi) {
  return api.post(`/livreur/tournees/${id}/ramassages`, { code_suivi: codeSuivi });
}

/** Colis déposé à la station A. */
export function scannerDepot(id, codeSuivi) {
  return api.post(`/livreur/tournees/${id}/depots`, { code_suivi: codeSuivi });
}

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
