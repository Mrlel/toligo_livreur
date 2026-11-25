import { api } from '../../api/client';
import { lireBooleen, lireNombre, lireObjet } from '../../utils/lecture';

/**
 * Profil du livreur connecté, disponibilité et position
 * (routes /livreur/me, /livreur/statut, /livreur/position, /livreur/logout).
 */

/** Profil renvoyé par l'API (LivreurResource), en noms JavaScript. */
export function versProfil(json) {
  const station = json.station ? lireObjet(json.station) : null;
  return {
    id: json.id ?? '',
    nomComplet: json.nom_complet ?? '',
    telephone: json.telephone ?? '',
    email: json.email ?? null,
    statut: json.statut ?? 'indisponible',
    // Un livreur peut avoir les deux rôles : les onglets suivent ces deux valeurs.
    estChauffeur: lireBooleen(json.est_chauffeur_ramassage),
    estLivreurDomicile: lireBooleen(json.est_livreur_domicile),
    // Station actuelle ; le véhicule est choisi pour chaque tournée ou livraison.
    station: station && { id: station.id ?? '', code: station.code ?? '', nom: station.nom ?? '' },
    noteMoyenne: lireNombre(json.note_moyenne),
  };
}

export async function chargerProfil() {
  return versProfil(lireObjet(await api.get('/livreur/me')));
}

/** `statut` : 'disponible', 'en_pause' ou 'indisponible' (les seuls que le livreur choisit). */
export async function changerStatut(statut) {
  return versProfil(lireObjet(await api.patch('/livreur/statut', { statut })));
}

/** Position remontée pendant le service (voir commun/Position.jsx). */
export function envoyerPosition(latitude, longitude) {
  return api.put('/livreur/position', { latitude, longitude });
}

export function seDeconnecter() {
  return api.post('/livreur/logout');
}

/**
 * Statuts du livreur (enum StatutLivreur) : libellé, pastille et couleur du
 * point. `en_mission` est posé par le système (tournée démarrée, colis pris),
 * `incident` par l'exploitation.
 */
export const STATUTS_LIVREUR = {
  disponible: { libelle: 'Disponible', ton: 'succes', couleur: 'var(--succes)' },
  en_mission: { libelle: 'En mission', ton: 'accent', couleur: 'var(--accent)' },
  en_pause: { libelle: 'En pause', ton: 'neutre', couleur: 'var(--texte-discret)' },
  indisponible: { libelle: 'Indisponible', ton: 'neutre', couleur: 'var(--gris-rond)' },
  incident: { libelle: 'Incident', ton: 'erreur', couleur: 'var(--erreur)' },
};

export function infosStatut(statut) {
  return STATUTS_LIVREUR[statut] ?? STATUTS_LIVREUR.indisponible;
}

/** Statuts proposés au livreur, dans l'ordre des boutons. */
export const STATUTS_DECLARABLES = ['disponible', 'en_pause', 'indisponible'];

const TYPES_VEHICULE = { moto: 'Moto', velo: 'Vélo', voiture: 'Voiture', camion: 'Camion', autre: 'Véhicule' };

export function libelleVehicule(type) {
  return TYPES_VEHICULE[type] ?? 'Véhicule';
}
