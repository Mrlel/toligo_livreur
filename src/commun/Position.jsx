import { createContext, useContext, useEffect, useRef, useState } from 'react';

import { envoyerPosition } from '../fonctionnalites/profil/api';
import { useSession } from '../session/Session';

/**
 * Partage de la position du livreur pendant son service (CDC V3.3 §18.1).
 *
 * Tant que le livreur est « Disponible » ou « En mission », la position du
 * téléphone est suivie et envoyée au serveur (PUT /livreur/position) au plus
 * toutes les 30 secondes : la station voit où il est, le client suit sa
 * livraison. En pause ou indisponible, rien n'est suivi ni envoyé.
 *
 * Les écrans lisent la dernière position connue avec `usePosition()` :
 * repère « vous » sur les cartes, coordonnées jointes à la remise d'un colis.
 *
 * Le livreur peut couper l'envoi depuis son profil (« Partager ma position »,
 * activé par défaut, choix gardé sur le téléphone) : la station ne le voit
 * plus sur la carte.
 *
 * `etat` : 'inactif' (hors service), 'coupee' (partage coupé par le livreur),
 * 'recherche', 'partagee', 'refusee' (autorisation refusée dans le
 * navigateur) ou 'indisponible' (pas de GPS, page en HTTP sur un téléphone...).
 */
const ContextePosition = createContext({ etat: 'inactif', position: null, partageActive: true, changerPartage: () => {} });

/** Choix « Partager ma position », gardé sur le téléphone. */
const CLE_PARTAGE = 'toligo_livreur_partage_position';

function lirePartage() {
  try {
    return window.localStorage.getItem(CLE_PARTAGE) !== 'non';
  } catch {
    return true;
  }
}

/** Délai minimal entre deux envois au serveur (la route accepte 120 appels par minute). */
const INTERVALLE_ENVOI = 30000;

/** Statuts pendant lesquels la position est partagée. */
const STATUTS_EN_SERVICE = ['disponible', 'en_mission'];

export function FournisseurPosition({ children }) {
  const { profil } = useSession();
  const enService = Boolean(profil) && STATUTS_EN_SERVICE.includes(profil.statut);
  const [partageActive, setPartageActive] = useState(lirePartage);

  function changerPartage(actif) {
    setPartageActive(actif);
    try {
      window.localStorage.setItem(CLE_PARTAGE, actif ? 'oui' : 'non');
    } catch {
      // Stockage indisponible (navigation privée) : le choix vaut pour la session.
    }
  }

  const [etat, setEtat] = useState('inactif');
  const [position, setPosition] = useState(null);
  const dernierEnvoi = useRef(0);
  const derniere = useRef(null);

  useEffect(() => {
    if (!enService) {
      setEtat('inactif');
      return undefined;
    }
    if (!partageActive) {
      setEtat('coupee');
      return undefined;
    }
    if (!('geolocation' in navigator)) {
      setEtat('indisponible');
      return undefined;
    }

    setEtat('recherche');

    function envoyer(point) {
      dernierEnvoi.current = Date.now();
      envoyerPosition(point[0], point[1]).catch(() => {
        // Réseau coupé : on renverra au prochain point.
        dernierEnvoi.current = 0;
      });
    }

    const suivi = navigator.geolocation.watchPosition(
      (resultat) => {
        const point = [resultat.coords.latitude, resultat.coords.longitude];
        derniere.current = point;
        setPosition(point);
        setEtat('partagee');
        if (Date.now() - dernierEnvoi.current >= INTERVALLE_ENVOI) envoyer(point);
      },
      (erreur) => {
        // 1 : autorisation refusée ; 2 : position introuvable ; 3 : délai dépassé
        // (on continue d'attendre).
        if (erreur.code === 1) setEtat('refusee');
        else if (erreur.code === 2) setEtat('indisponible');
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 },
    );

    // Livreur immobile (attente à la station...) : le téléphone ne signale
    // plus de nouveau point, on renvoie le dernier pour rester « vu ».
    const relance = setInterval(() => {
      if (derniere.current && Date.now() - dernierEnvoi.current >= 2 * INTERVALLE_ENVOI) envoyer(derniere.current);
    }, INTERVALLE_ENVOI);

    return () => {
      navigator.geolocation.clearWatch(suivi);
      clearInterval(relance);
    };
  }, [enService, partageActive]);

  return <ContextePosition.Provider value={{ etat, position, partageActive, changerPartage }}>{children}</ContextePosition.Provider>;
}

/** `const { etat, position, partageActive, changerPartage } = usePosition();` — `position` : [latitude, longitude] ou null. */
export function usePosition() {
  return useContext(ContextePosition);
}

/** Phrase courte qui explique l'état du partage de position. */
export function texteEtatPosition(etat) {
  switch (etat) {
    case 'partagee':
      return 'Position partagée avec votre station.';
    case 'recherche':
      return 'Recherche de votre position…';
    case 'refusee':
      return 'Position bloquée : autorisez la localisation pour cette application dans le navigateur.';
    case 'indisponible':
      return 'Position introuvable : activez la localisation du téléphone.';
    case 'coupee':
      return 'Partage coupé : votre station ne vous voit plus sur la carte.';
    default:
      return 'Position non partagée tant que vous êtes en pause ou indisponible.';
  }
}
