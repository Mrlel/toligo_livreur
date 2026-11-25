/**
 * Adresses (« routes ») de tous les écrans de l'application livreur
 * (maquettes toligo_livreur/ecrans/LV-*.html).
 *
 * Pour ouvrir un écran : `naviguer(Routes.livraison(id))`.
 */
export const Routes = {
  connexion: '/connexion',

  // --- Écrans principaux (onglets) ---
  accueil: '/accueil',
  tournees: '/tournees',
  livraisons: '/livraisons',
  activite: '/activite',
  profil: '/profil',

  // --- Livraison à domicile (étapes 1 à 4) ---
  livraison: (id) => `/livraisons/${id}`,
  prise: (id) => `/livraisons/${id}/prise`,
  remise: (id) => `/livraisons/${id}/remise`,
  echec: (id) => `/livraisons/${id}/echec`,
  finLivraison: (id) => `/livraisons/${id}/fin`,

  // --- Tournée de ramassage ---
  tournee: (id) => `/tournees/${id}`,
  anomalie: (id) => `/tournees/${id}/anomalie`,
};

/** Les quatre écrans principaux, qui affichent les onglets du bas sur téléphone. */
export const ROUTES_ONGLETS = [Routes.accueil, Routes.tournees, Routes.livraisons, Routes.activite];
