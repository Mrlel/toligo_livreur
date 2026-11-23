import { useNavigate } from 'react-router-dom';
import { Boxes, RefreshCw, Truck, Warehouse } from 'lucide-react';

import { BoutonRond, Carte, Cascade, Page, Pastille, TitreEcran, VueDonnees, VueVide } from '../../composants';
import { Routes } from '../../commun/routes';
import { heure, majuscule, moment } from '../../utils/formatage';
import { useActualisation, useDonnees } from '../../utils/useDonnees';
import { infosStatutTournee, listerTournees } from './api';
import './tournees.css';

/** Tournées de ramassage prévues ou en cours du chauffeur. */
export default function TourneesPage() {
  const tournees = useDonnees(listerTournees, []);
  useActualisation(tournees.recharger);

  return (
    <Page titre="Tournées" largeur="large">
      <TitreEcran action={<BoutonRond icone={RefreshCw} libelle="Actualiser" onClick={tournees.recharger} />}>Tournées</TitreEcran>

      <VueDonnees etat={tournees} messageChargement="Chargement de vos tournées…">
        {(liste) =>
          liste.length === 0 ? (
            <VueVide
              icone={Truck}
              titre="Aucune tournée prévue"
              message="Les tournées de ramassage sont planifiées par l'équipe Tôligo. Elles apparaîtront ici."
            />
          ) : (
            <Cascade className="grille grille--2">
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

/** Carte d'une tournée : date, station d'arrivée, camion, sites. Utilisée aussi par l'accueil. */
export function CarteTournee({ tournee }) {
  const naviguer = useNavigate();
  const statut = infosStatutTournee(tournee.statut);
  const quand = tournee.statut === 'en_cours' ? tournee.demarreeLe : tournee.planifieeLe;

  return (
    <Carte onClick={() => naviguer(Routes.tournee(tournee.id))}>
      <div className="carte-tournee__haut">
        <span className={`carte-tournee__icone${tournee.statut === 'en_cours' ? ' carte-tournee__icone--active' : ''}`}>
          <Truck size={21} aria-hidden="true" />
        </span>
        <div className="extensible">
          <p className="carte-tournee__titre une-ligne">
            {!quand ? 'Date à préciser' : tournee.statut === 'en_cours' ? `Démarrée à ${heure(quand)}` : majuscule(moment(quand))}
          </p>
          <p className="carte-tournee__detail une-ligne">Arrivée : {tournee.station?.nom ?? 'station'}</p>
        </div>
        <Pastille ton={statut.ton} petite>
          {statut.libelle}
        </Pastille>
      </div>

      <div className="carte-tournee__bas">
        {tournee.vehicule && (
          <span className="carte-tournee__info">
            <Truck size={15} aria-hidden="true" />
            {tournee.vehicule.immatriculation}
          </span>
        )}
        {tournee.entrepots && (
          <span className="carte-tournee__info une-ligne">
            <Warehouse size={15} aria-hidden="true" />
            {tournee.entrepots.length === 0
              ? 'Tous les sites'
              : tournee.entrepots.length === 1
                ? tournee.entrepots[0].nom
                : `${tournee.entrepots.length} sites`}
          </span>
        )}
        {tournee.statut === 'en_cours' && tournee.nbBox > 0 && (
          <span className="carte-tournee__info">
            <Boxes size={15} aria-hidden="true" />
            {tournee.nbBox} box
          </span>
        )}
      </div>
    </Carte>
  );
}
