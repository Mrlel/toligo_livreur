/**
 * Adresses (« routes ») de tous les écrans de l'application livreur.
 *
 * Pour ouvrir un écran : `naviguer(Routes.livraison(id))`.
 */
export const Routes = {
  connexion: '/connexion',

  // --- Écrans principaux (onglets) ---
  accueil: '/accueil',
  livraisons: '/livraisons',
  tournees: '/tournees',
  profil: '/profil',

  // --- Livraison à domicile ---
  livraison: (id) => `/livraisons/${id}`,
  remise: (id) => `/livraisons/${id}/remise`,

  // --- Tournée de ramassage ---
  tournee: (id) => `/tournees/${id}`,
};

/** Les quatre écrans principaux, qui affichent les onglets du bas sur téléphone. */
export const ROUTES_ONGLETS = [Routes.accueil, Routes.livraisons, Routes.tournees, Routes.profil];
