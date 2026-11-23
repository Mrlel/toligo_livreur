import { useNavigate } from 'react-router-dom';
import { Banknote, MapPin, Package, RefreshCw, Warehouse } from 'lucide-react';

import {
  AvatarInitiales,
  BoutonRond,
  Carte,
  Cascade,
  Page,
  Pastille,
  TitreEcran,
  VueDonnees,
  VueVide,
} from '../../composants';
import { Routes } from '../../commun/routes';
import { prix } from '../../utils/formatage';
import { useActualisation, useDonnees } from '../../utils/useDonnees';
import { infosStatutMission, listerMissions, nombreDeColis } from './api';
import './livraisons.css';

/**
 * Livraisons à domicile en cours du livreur, dans l'ordre d'affectation.
 *
 * La liste se recharge toute seule (toutes les minutes, et au retour sur
 * l'application) : une livraison affectée par la station apparaît sans action.
 */
export default function LivraisonsPage() {
  const donnees = useDonnees(listerMissions, []);
  useActualisation(donnees.recharger);

  return (
    <Page titre="Livraisons" largeur="large">
      <TitreEcran action={<BoutonRond icone={RefreshCw} libelle="Actualiser" onClick={donnees.recharger} />}>Livraisons</TitreEcran>

      <VueDonnees etat={donnees} messageChargement="Chargement de vos livraisons…">
        {({ missions, especesDetenues }) => (
          <>
            {especesDetenues > 0 && <CarteEspeces montant={especesDetenues} />}

            {missions.length === 0 ? (
              <VueVide
                icone={Package}
                titre="Aucune livraison pour le moment"
                message="Le gestionnaire de votre station vous affecte les livraisons. Restez « Disponible » pour en recevoir."
              />
            ) : (
              <Cascade className="grille grille--2">
                {missions.map((mission) => (
                  <CarteMission key={mission.id} mission={mission} />
                ))}
              </Cascade>
            )}
          </>
        )}
      </VueDonnees>
    </Page>
  );
}

/**
 * Carte d'une livraison : destinataire, adresse, colis, montant à encaisser.
 * Utilisée aussi par l'accueil.
 */
export function CarteMission({ mission }) {
  const naviguer = useNavigate();
  const statut = infosStatutMission(mission.statut);
  const { destinataire } = mission;
  // Avant la prise en charge, l'information utile est la station où aller.
  const aPrendre = mission.statut === 'affectee' && mission.station;

  return (
    <Carte onClick={() => naviguer(Routes.livraison(mission.id))}>
      <div className="carte-mission__haut">
        <AvatarInitiales nom={destinataire.nom} accent />
        <div className="extensible">
          <p className="carte-mission__nom une-ligne">{destinataire.nom || 'Destinataire'}</p>
          <p className="carte-mission__adresse une-ligne">{destinataire.adresse}</p>
        </div>
        <Pastille ton={statut.ton} petite>
          {statut.libelle}
        </Pastille>
      </div>

      <div className="carte-mission__bas">
        <span className="carte-mission__info">
          <Package size={15} aria-hidden="true" />
          {nombreDeColis(mission)}
        </span>
        {aPrendre ? (
          <span className="carte-mission__info une-ligne">
            <Warehouse size={15} aria-hidden="true" />
            {mission.station.nom}
          </span>
        ) : (
          destinataire.lieuProche && (
            <span className="carte-mission__info une-ligne">
              <MapPin size={15} aria-hidden="true" />
              près de {destinataire.lieuProche.nom}
            </span>
          )
        )}
        {mission.montantAEncaisser > 0 && (
          <Pastille ton="accent" petite icone={Banknote} className="carte-mission__montant">
            {prix(mission.montantAEncaisser)}
          </Pastille>
        )}
      </div>
    </Carte>
  );
}

/** Espèces encaissées et pas encore reversées à la station. Utilisée aussi par l'accueil. */
export function CarteEspeces({ montant }) {
  return (
    <div className="carte-especes">
      <span className="carte-especes__icone">
        <Banknote size={22} aria-hidden="true" />
      </span>
      <div className="extensible">
        <p className="carte-especes__libelle">Espèces à reverser</p>
        <p className="carte-especes__montant">{prix(montant)}</p>
        <p className="carte-especes__note">Remettez-les à votre station en fin de service.</p>
      </div>
    </div>
  );
}
