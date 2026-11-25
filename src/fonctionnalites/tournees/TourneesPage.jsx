import { useNavigate } from 'react-router-dom';
import { RefreshCw, Truck } from 'lucide-react';

import { BoutonRond, Cascade, Illustration, Page, Pastille, TitreEcran, VueDonnees, VueVide, cliquable } from '../../composants';
import { Routes } from '../../commun/routes';
import { estAujourdhui, jourMois, plage } from '../../utils/formatage';
import { useActualisation, useDonnees } from '../../utils/useDonnees';
import { nomVehicule } from '../livraisons/api';
import { infosStatutTournee, listerTournees } from './api';
import './tournees.css';

/** Onglet « Ramassage » : tournées prévues ou en cours (chauffeur ou aide). */
export default function TourneesPage() {
  const tournees = useDonnees(listerTournees, []);
  useActualisation(tournees.recharger);

  return (
    <Page titre="Ramassage" largeur="moyenne">
      <TitreEcran action={<BoutonRond icone={RefreshCw} libelle="Actualiser" onClick={tournees.recharger} />}>Ramassage</TitreEcran>

      <VueDonnees etat={tournees} messageChargement="Chargement de vos tournées…">
        {(liste) =>
          liste.length === 0 ? (
            <VueVide
              icone={Truck}
              titre="Aucune tournée prévue"
              message="Le gestionnaire de votre station planifie les tournées de ramassage. Elles apparaîtront ici."
            />
          ) : (
            <Cascade className="pile" style={{ gap: 10 }}>
              {liste.map((tournee) => (
                <CarteTournee key={tournee.id} tournee={tournee} />
              ))}
            </Cascade>
          )
        }
      </VueDonnees>
    </Page>
  );
}

/** « 3 entrepôts → Station Cocody ». */
export function trajetTournee(tournee) {
  const nb = tournee.sites?.length ?? tournee.entrepots?.length ?? 0;
  const sites = nb === 0 ? 'Entrepôts de la station' : `${nb} entrepôt${nb > 1 ? 's' : ''}`;
  return `${sites} → ${tournee.station?.nom ?? 'station'}`;
}

/** Carte d'une tournée (maquette LV-Accueil) : camion, trajet, horaires, véhicule. Utilisée aussi par l'accueil. */
export function CarteTournee({ tournee }) {
  const naviguer = useNavigate();
  const statut = infosStatutTournee(tournee.statut);
  const jour = tournee.planifieeLe && !estAujourdhui(tournee.planifieeLe) ? `${jourMois(tournee.planifieeLe)} · ` : '';
  const quand = `${jour}${plage(tournee.planifieeLe, tournee.finPrevueLe)}`;

  return (
    <div className="carte-jour" {...cliquable(() => naviguer(Routes.tournee(tournee.id)))}>
      <span className="tuile">
        <Illustration nom="camion" taille={64} carre={false} />
      </span>
      <span className="carte-jour__texte">
        <span className="carte-jour__haut">
          <span className="carte-jour__titre une-ligne">Ramassage</span>
          <span className="rangee" style={{ gap: 4 }}>
            {tournee.monRole === 'aide' && (
              <Pastille ton="sombre" petite>
                Aide
              </Pastille>
            )}
            <Pastille ton={statut.ton} petite>
              {statut.libelle}
            </Pastille>
          </span>
        </span>
        <span className="carte-jour__ligne une-ligne">{trajetTournee(tournee)}</span>
        <span className="carte-jour__ligne carte-jour__ligne--forte une-ligne">
          {[quand, nomVehicule(tournee.vehicule)].filter(Boolean).join(' · ')}
        </span>
      </span>
    </div>
  );
}
