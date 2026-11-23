import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { configurerApi } from '../api/client';
import { chargerProfil } from '../fonctionnalites/profil/api';

/**
 * Session du livreur : le jeton de connexion Sanctum, et le profil du livreur
 * connecté (GET /livreur/me), avec son statut et ses rôles.
 *
 * Le jeton est gardé dans le navigateur (localStorage) : en rouvrant
 * l'application, le livreur reste connecté.
 */
const ContexteSession = createContext(null);

// Différente de celle de l'application client : les deux applications
// peuvent être ouvertes dans le même navigateur.
const CLE_JETON = 'toligo_livreur_jeton';

function lireJetonStocke() {
  try {
    return localStorage.getItem(CLE_JETON);
  } catch {
    // Stockage illisible (navigation privée...) : on repart sans session.
    return null;
  }
}

function ecrireJetonStocke(jeton) {
  try {
    if (jeton) localStorage.setItem(CLE_JETON, jeton);
    else localStorage.removeItem(CLE_JETON);
  } catch {
    // Sans stockage, la session ne survivra pas au rechargement de la page.
  }
}

export function FournisseurSession({ children }) {
  const [jeton, setJeton] = useState(lireJetonStocke);
  const [profil, setProfil] = useState(null);
  const [versionProfil, setVersionProfil] = useState(0);

  // Le client API lit toujours le jeton le plus récent.
  const jetonActuel = useRef(jeton);
  jetonActuel.current = jeton;

  /** Ouvre la session ; `profilInitial` : le profil renvoyé par la connexion. */
  const ouvrir = useCallback((nouveauJeton, profilInitial = null) => {
    ecrireJetonStocke(nouveauJeton);
    jetonActuel.current = nouveauJeton;
    setProfil(profilInitial);
    setJeton(nouveauJeton);
  }, []);

  const fermer = useCallback(() => {
    ecrireJetonStocke(null);
    jetonActuel.current = null;
    setJeton(null);
    setProfil(null);
  }, []);

  // Branché pendant le rendu (et non dans un effet) : les écrans enfants
  // appellent l'API dans leurs propres effets, qui passent avant ceux du parent.
  configurerApi({
    lireJeton: () => jetonActuel.current,
    // Jeton expiré ou révoqué : retour à l'écran de connexion.
    surNonAuthentifie: () => {
      if (jetonActuel.current) fermer();
    },
  });

  // Profil rechargé à chaque connexion, et à la demande (rechargerProfil) :
  // le statut change aussi sans le livreur (tournée démarrée, colis remis).
  useEffect(() => {
    if (!jeton) return undefined;
    let actif = true;
    chargerProfil()
      .then((livreur) => actif && setProfil(livreur))
      .catch(() => {
        // Sans profil, les écrans affichent simplement moins d'informations.
      });
    return () => {
      actif = false;
    };
  }, [jeton, versionProfil]);

  const rechargerProfil = useCallback(() => setVersionProfil((v) => v + 1), []);

  return (
    <ContexteSession.Provider
      value={{ jeton, estConnecte: Boolean(jeton), profil, ouvrir, fermer, rechargerProfil, mettreAJourProfil: setProfil }}
    >
      {children}
    </ContexteSession.Provider>
  );
}

/** `const { estConnecte, profil, ouvrir, fermer, rechargerProfil } = useSession();` */
export function useSession() {
  return useContext(ContexteSession);
}
