import { api } from '../../api/client';
import { lireDate, lireEntier, lireListe, lireNombre, lireObjet } from '../../utils/lecture';

/**
 * « Mon activité » (maquette LV-Activite, route GET /livreur/activite) :
 * compteurs de la période, espèces à reverser et historique.
 *
 * `periode` : 'jour', 'semaine' ou 'mois'.
 */
export async function chargerActivite(periode) {
  const json = lireObjet(await api.get(`/livreur/activite?periode=${periode}`));
  const compteurs = lireObjet(json.compteurs);
  const especes = lireObjet(json.especes);
  return {
    compteurs: {
      missionsTerminees: lireEntier(compteurs.missions_terminees) ?? 0,
      colisLivres: lireEntier(compteurs.colis_livres) ?? 0,
      colisRamasses: lireEntier(compteurs.colis_ramasses) ?? 0,
      livraisonsEchouees: lireEntier(compteurs.livraisons_echouees) ?? 0,
      tourneesTerminees: lireEntier(compteurs.tournees_terminees) ?? 0,
    },
    especes: {
      detenues: lireNombre(especes.detenues) ?? 0,
      plafond: lireNombre(especes.plafond),
      station: especes.station ?? null,
    },
    historique: lireListe(json.historique).map((ligne) => ({
      type: ligne.type === 'tournee' ? 'tournee' : 'mission',
      id: ligne.id ?? '',
      reference: ligne.reference ?? '',
      titre: ligne.titre ?? null,
      nbColis: lireEntier(ligne.nb_colis) ?? 0,
      statut: ligne.statut ?? '',
      motif: ligne.motif ?? null,
      date: lireDate(ligne.date),
    })),
  };
}

/** Motifs d'échec d'une livraison, en clair. */
export const MOTIFS_ECHEC = {
  destinataire_absent: 'Destinataire absent',
  adresse_incorrecte: 'Adresse incorrecte',
};
