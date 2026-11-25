import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AvatarInitiales, BlocGris, Cascade, OngletsSegmentes, Page, Roue, VueErreur, useMessages } from '../../composants';
import { texteEtatPosition, usePosition } from '../../commun/Position';
import { Routes } from '../../commun/routes';
import { useSession } from '../../session/Session';
import { dateDuJour, prenom } from '../../utils/formatage';
import { useActualisation, useDonnees } from '../../utils/useDonnees';
import { listerMissions } from '../livraisons/api';
import { BlocEspeces, CarteMission } from '../livraisons/LivraisonsPage';
import { STATUTS_DECLARABLES, changerStatut, infosStatut } from '../profil/api';
import { listerTournees } from '../tournees/api';
import { CarteTournee } from '../tournees/TourneesPage';
import '../livraisons/livraisons.css';
import '../tournees/tournees.css';
import './accueil.css';

/** Messages affichés après un changement de statut. */
const MESSAGES_STATUT = {
  disponible: 'Vous êtes disponible : votre station peut vous confier des colis.',
  en_pause: 'Pause enregistrée. Repassez « Disponible » à votre retour.',
  indisponible: 'Vous êtes indisponible. Bonne fin de journée !',
};

/** Phrase sous le statut, dans la carte noire. */
const PRECISIONS_STATUT = {
  disponible: 'Votre station peut vous confier des colis',
  en_mission: 'Statut posé par le système jusqu’à la fin de la mission',
  en_pause: 'Repassez « Disponible » à votre retour',
  indisponible: 'Vous ne recevez ni mission ni tournée',
  incident: 'Un incident est en cours : contactez votre station',
};

/**
 * Accueil du livreur (maquette LV-Accueil) : date, bonjour, station ; sa
 * disponibilité dans une carte noire ; ce qu'il a à faire aujourd'hui
 * (missions, tournées) ; les espèces à reverser.
 *
 * Les missions ne sont chargées que pour un livreur à domicile, les tournées
 * que pour un chauffeur de ramassage (ou un aide).
 */
export default function AccueilPage() {
  const naviguer = useNavigate();
  const { profil, mettreAJourProfil, rechargerProfil } = useSession();
  const { afficherMessage, afficherErreur } = useMessages();
  const [statutEnCours, setStatutEnCours] = useState(null);

  const estLivreurDomicile = profil?.estLivreurDomicile ?? false;

  const missions = useDonnees(() => (estLivreurDomicile ? listerMissions() : Promise.resolve(null)), [estLivreurDomicile]);
  // Un livreur à domicile peut aussi être aide sur une tournée : on charge toujours.
  const tournees = useDonnees(listerTournees, []);

  // Tout se recharge au retour sur l'application et chaque minute : une
  // livraison affectée par la station apparaît sans action du livreur.
  const { recharger: rechargerMissions } = missions;
  const { recharger: rechargerTournees } = tournees;
  const toutRecharger = useCallback(() => {
    rechargerMissions();
    rechargerTournees();
    rechargerProfil();
  }, [rechargerMissions, rechargerTournees, rechargerProfil]);
  useActualisation(toutRecharger);

  async function choisirStatut(statut) {
    if (!profil || statut === profil.statut) return;
    setStatutEnCours(statut);
    try {
      mettreAJourProfil(await changerStatut(statut));
      afficherMessage(MESSAGES_STATUT[statut]);
    } catch (erreur) {
      afficherErreur(erreur);
    } finally {
      setStatutEnCours(null);
    }
  }

  const listeMissions = missions.donnees?.missions ?? [];
  const listeTournees = tournees.donnees ?? [];
  const charge = (!estLivreurDomicile || missions.donnees !== undefined) && tournees.donnees !== undefined;
  const erreur = missions.erreur ?? tournees.erreur;

  return (
    <Page titre="Accueil" largeur="moyenne">
      <div className="accueil">
        <div className="accueil__entete">
          <Link to={Routes.profil} aria-label="Mon profil" className="accueil__avatar">
            <AvatarInitiales nom={profil?.nomComplet} taille={44} fond="var(--encre)" couleur="var(--blanc)" />
          </Link>
          <div className="extensible">
            <p className="accueil__date">{dateDuJour()}</p>
            <p className="accueil__bonjour une-ligne">Bonjour, {prenom(profil?.nomComplet) || ' '}</p>
          </div>
          {profil?.station && <span className="accueil__station">{profil.station.nom}</span>}
        </div>

        <CarteDisponibilite profil={profil} statutEnCours={statutEnCours} onChoisir={choisirStatut} />

        <section>
          <div className="titre-bloc">
            <span className="etiquette-section">Aujourd’hui</span>
          </div>
          {erreur && !charge ? (
            <VueErreur erreur={erreur} onReessayer={toutRecharger} />
          ) : !charge ? (
            <div style={{ padding: 16, textAlign: 'center' }}>
              <Roue />
            </div>
          ) : listeMissions.length === 0 && listeTournees.length === 0 ? (
            <BlocGris>
              <p className="texte-secondaire" style={{ fontSize: 14 }}>
                Rien de prévu pour le moment. Votre station vous affecte les missions et les tournées : elles apparaîtront ici.
              </p>
            </BlocGris>
          ) : (
            <Cascade className="pile" style={{ gap: 10 }}>
              {listeMissions.map((mission) => (
                <CarteMission key={mission.id} mission={mission} />
              ))}
              {listeTournees.map((tournee) => (
                <CarteTournee key={tournee.id} tournee={tournee} />
              ))}
            </Cascade>
          )}
        </section>

        {estLivreurDomicile && missions.donnees && (
          <BlocEspeces montant={missions.donnees.especesDetenues} plafond={missions.donnees.plafondEspeces} onClick={() => naviguer(Routes.activite)} />
        )}

        {profil && !estLivreurDomicile && !profil.estChauffeur && (
          <BlocGris>
            <p className="texte-secondaire" style={{ fontSize: 14 }}>
              Votre compte n'a pas encore de rôle (livraison à domicile ou tournée de ramassage). Contactez l'équipe Tôligo.
            </p>
          </BlocGris>
        )}
      </div>
    </Page>
  );
}

/**
 * Disponibilité du livreur (BF-LIV-02), carte noire : point de couleur,
 * statut, précision ; trois boutons pour la changer. « En mission » est posé
 * par le système : les boutons sont alors grisés.
 */
function CarteDisponibilite({ profil, statutEnCours, onChoisir }) {
  const naviguer = useNavigate();
  const { etat: etatPosition } = usePosition();
  const statut = infosStatut(profil?.statut);
  const enMission = profil?.statut === 'en_mission';
  const positionEnDefaut = etatPosition === 'refusee' || etatPosition === 'indisponible';

  return (
    <div className={`carte-disponibilite${enMission ? ' carte-disponibilite--bloquee' : ''}`}>
      <div className="rangee" style={{ gap: 10 }}>
        <span className="carte-disponibilite__point" style={{ background: statut.couleur, '--halo': statut.couleur }} aria-hidden="true" />
        <span className="extensible">
          <span className="carte-disponibilite__statut">{profil ? statut.libelle : '…'}</span>
          <span className="carte-disponibilite__precision">{PRECISIONS_STATUT[profil?.statut] ?? ''}</span>
        </span>
        {statutEnCours && <Roue taille="petite" />}
      </div>

      {profil && (
        <div aria-disabled={enMission || undefined}>
          <OngletsSegmentes
            onglets={STATUTS_DECLARABLES.map((cle) => ({ cle, libelle: infosStatut(cle).libelle }))}
            courant={enMission ? null : (statutEnCours ?? profil.statut)}
            onChoisir={enMission ? () => {} : onChoisir}
          />
        </div>
      )}

      {positionEnDefaut && (
        <button type="button" className="carte-disponibilite__alerte" onClick={() => naviguer(Routes.profil)}>
          {texteEtatPosition(etatPosition)}
        </button>
      )}
    </div>
  );
}
