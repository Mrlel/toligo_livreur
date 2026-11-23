import { api } from '../../api/client';
import { lireBooleen, lireDate, lireEntier, lireListe, lireNombre, lireObjet } from '../../utils/lecture';

/**
 * Livraisons à domicile (missions « dernier km », routes /livreur/missions).
 *
 * Le gestionnaire de la station B affecte la mission au livreur. Le livreur :
 * 1. prend les colis à la station (prise-en-charge) ;
 * 2. appelle le destinataire pour confirmer l'adresse (confirmation-adresse) ;
 * 3. part (depart) ;
 * 4. remet les colis avec une preuve : code de retrait ou photo (remise),
 *    ou signale un échec (destinataire absent, adresse incorrecte, refus de
 *    paiement).
 */

function versStation(json) {
  if (!json) return null;
  const station = lireObjet(json);
  return {
    id: station.id ?? '',
    code: station.code ?? '',
    nom: station.nom ?? '',
    adresse: station.adresse ?? '',
    repere: station.repere ?? null,
    latitude: lireNombre(station.latitude),
    longitude: lireNombre(station.longitude),
  };
}

/** Mission renvoyée par l'API (MissionLivreurResource). */
function versMission(json) {
  const destinataire = lireObjet(json.destinataire);
  const lieuProche = destinataire.lieu_proche ? lireObjet(destinataire.lieu_proche) : null;
  return {
    id: json.id ?? '',
    reference: json.reference ?? '',
    statut: json.statut ?? '',
    station: versStation(json.station),
    affecteeLe: lireDate(json.affectee_le),
    adresseConfirmeeLe: lireDate(json.adresse_confirmee_le),
    poidsTotalKg: lireNombre(json.poids_total_kg),
    colis: lireListe(json.colis).map((colis) => ({
      codeSuivi: colis.code_suivi ?? '',
      statut: colis.statut ?? '',
      format: colis.format ?? null,
      estFragile: lireBooleen(colis.est_fragile),
    })),
    destinataire: {
      nom: destinataire.nom ?? '',
      telephone: destinataire.telephone ?? '',
      adresse: destinataire.adresse ?? '',
      repere: destinataire.repere ?? null,
      instructions: destinataire.instructions ?? null,
      latitude: lireNombre(destinataire.latitude),
      longitude: lireNombre(destinataire.longitude),
      // Lieu connu à moins de 500 m (pharmacie, quartier...) pour s'orienter.
      lieuProche: lieuProche && {
        nom: lieuProche.nom ?? '',
        distanceM: lireEntier(lieuProche.distance_m),
      },
    },
    // Paiement à la livraison pas encore réglé : 0 si rien à encaisser.
    montantAEncaisser: lireNombre(json.montant_a_encaisser) ?? 0,
  };
}

/** Missions en cours du livreur et espèces qu'il doit encore reverser. */
export async function listerMissions() {
  const json = lireObjet(await api.get('/livreur/missions'));
  return {
    missions: lireListe(json.missions).map(versMission),
    especesDetenues: lireNombre(json.especes_detenues) ?? 0,
  };
}

export async function detailMission(id) {
  return versMission(lireObjet(await api.get(`/livreur/missions/${id}`)));
}

export async function prendreEnCharge(id) {
  return versMission(lireObjet(await api.post(`/livreur/missions/${id}/prise-en-charge`)));
}

/** `mode` : 'appel' ou 'sms'. */
export async function confirmerAdresse(id, mode) {
  return versMission(lireObjet(await api.post(`/livreur/missions/${id}/confirmation-adresse`, { mode })));
}

export async function partir(id) {
  return versMission(lireObjet(await api.post(`/livreur/missions/${id}/depart`)));
}

/**
 * Remise des colis. Preuve : `codes`, le code de retrait de chaque colis
 * ({ [codeSuivi]: '482719' }, un SMS par colis reçu par le destinataire),
 * ou `photo` (fichier) pour toute la livraison. `modePaiement` : 'especes' si
 * le destinataire paie en liquide. Position du livreur jointe si connue.
 */
export async function remettre(id, { codes, photo, modePaiement, position }) {
  const champs = {
    mode_paiement: modePaiement || null,
    latitude: position?.[0] ?? null,
    longitude: position?.[1] ?? null,
  };

  // Avec une photo : formulaire multipart ; sans photo : JSON avec les codes.
  if (photo) {
    const formulaire = new FormData();
    formulaire.append('photo', photo);
    Object.entries(champs).forEach(([cle, valeur]) => {
      if (valeur !== null) formulaire.append(cle, valeur);
    });
    return versMission(lireObjet(await api.postFormulaire(`/livreur/missions/${id}/remise`, formulaire)));
  }
  return versMission(lireObjet(await api.post(`/livreur/missions/${id}/remise`, { ...champs, codes_retrait: codes })));
}

/** `motif` : 'destinataire_absent' ou 'adresse_incorrecte'. */
export async function signalerEchec(id, motif, commentaire) {
  return versMission(lireObjet(await api.post(`/livreur/missions/${id}/echec`, { motif, commentaire: commentaire || null })));
}

export async function refusDePaiement(id, commentaire) {
  return versMission(lireObjet(await api.post(`/livreur/missions/${id}/refus-paiement`, { commentaire: commentaire || null })));
}

/** Envoie au destinataire, par SMS, le lien de paiement en ligne. */
export function envoyerLienDePaiement(id) {
  return api.post(`/livreur/missions/${id}/lien-paiement`);
}

/** Statuts d'une mission (enum StatutMission, parcours terrestre). */
const STATUTS_MISSION = {
  affectee: { libelle: 'À prendre en station', ton: 'sombre' },
  recuperee: { libelle: 'Adresse à confirmer', ton: 'accent' },
  adresse_confirmee: { libelle: 'Prête à partir', ton: 'accent' },
  en_route_livraison: { libelle: 'En route', ton: 'vive' },
  terminee: { libelle: 'Livrée', ton: 'succes' },
  echouee: { libelle: 'Échouée', ton: 'erreur' },
  annulee: { libelle: 'Annulée', ton: 'neutre' },
};

export function infosStatutMission(statut) {
  return STATUTS_MISSION[statut] ?? { libelle: statut, ton: 'neutre' };
}

/** Missions encore à faire (les autres sont closes). */
export function estEnCours(mission) {
  return ['affectee', 'recuperee', 'adresse_confirmee', 'en_route_livraison'].includes(mission.statut);
}

/** « 3 colis » / « 1 colis ». */
export function nombreDeColis(mission) {
  return `${mission.colis.length} colis`;
}
