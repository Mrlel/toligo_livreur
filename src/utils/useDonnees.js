import { useCallback, useEffect, useState } from 'react';

/**
 * Charge une donnée depuis l'API et suit son état.
 *
 * ```js
 * const missions = useDonnees(() => listerMissions(), []);
 * // missions.donnees, missions.erreur, missions.chargement, missions.recharger()
 * ```
 *
 * Le chargement est relancé quand une valeur de `dependances` change, ou à
 * l'appel de `recharger()`. Pendant un rechargement, les données précédentes
 * restent affichées.
 *
 * Différence avec l'application client : si un rechargement échoue (réseau
 * faible pendant une tournée), les données déjà affichées sont gardées. Seul
 * un premier chargement raté affiche l'erreur.
 */
export function useDonnees(chargeur, dependances = []) {
  const [etat, setEtat] = useState({ donnees: undefined, erreur: null, chargement: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    setEtat((precedent) => ({ ...precedent, erreur: null, chargement: true }));

    chargeur().then(
      (donnees) => actif && setEtat({ donnees, erreur: null, chargement: false }),
      (erreur) => actif && setEtat((precedent) => ({ donnees: precedent.donnees, erreur, chargement: false })),
    );

    // Écran quitté avant la réponse : on ignore le résultat.
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependances, version]);

  const recharger = useCallback(() => setVersion((v) => v + 1), []);

  return { ...etat, recharger };
}

/**
 * Recharge une donnée quand le livreur revient sur l'application (téléphone
 * déverrouillé, retour depuis l'appel au destinataire...) et toutes les
 * `delai` millisecondes tant qu'elle est à l'écran : une nouvelle livraison
 * affectée par la station apparaît sans action de sa part.
 */
export function useActualisation(recharger, delai = 60000) {
  useEffect(() => {
    const siVisible = () => {
      if (document.visibilityState === 'visible') recharger();
    };
    document.addEventListener('visibilitychange', siVisible);
    const minuteur = delai ? setInterval(siVisible, delai) : null;
    return () => {
      document.removeEventListener('visibilitychange', siVisible);
      if (minuteur) clearInterval(minuteur);
    };
  }, [recharger, delai]);
}
