import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, LocateFixed, LocateOff, Package, RefreshCw, Truck } from 'lucide-react';

import {
  AvatarInitiales,
  BlocGris,
  BoutonRond,
  Cascade,
  OngletsSegmentes,
  Page,
  Roue,
  VueErreur,
  cliquable,
  useMessages,
} from '../../composants';
import { texteEtatPosition, usePosition } from '../../commun/Position';
import { Routes } from '../../commun/routes';
import { useSession } from '../../session/Session';
import { heure, prenom } from '../../utils/formatage';
import { useActualisation, useDonnees } from '../../utils/useDonnees';
import { infosStatutMission, listerMissions } from '../livraisons/api';
import { CarteEspeces, CarteMission } from '../livraisons/LivraisonsPage';
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

/**
 * Accueil du livreur : son statut (qu'il change lui-même), ce qu'il a à
 * faire tout de suite, ses livraisons et ses tournées, et les espèces à
 * reverser.
 *
 * Les livraisons ne sont chargées que pour un livreur à domicile, les
 * tournées que pour un chauffeur de ramassage.
 */
export default function AccueilPage() {
  const { profil, mettreAJourProfil, rechargerProfil } = useSession();
  const { afficherMessage, afficherErreur } = useMessages();
  const [statutEnCours, setStatutEnCours] = useState(null);

  const estLivreurDomicile = profil?.estLivreurDomicile ?? false;
  const estChauffeur = profil?.estChauffeur ?? false;

  const missions = useDonnees(() => (estLivreurDomicile ? listerMissions() : Promise.resolve(null)), [estLivreurDomicile]);
  const tournees = useDonnees(() => (estChauffeur ? listerTournees() : Promise.resolve(null)), [estChauffeur]);

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

  const tourneeEnCours = tournees.donnees?.find((t) => t.statut === 'en_cours');
  // Livraison commencée (colis pris) : c'est elle qu'il faut poursuivre.
  const missionEnCours = missions.donnees?.missions.find((m) => ['recuperee', 'adresse_confirmee', 'en_route_livraison'].includes(m.statut));

  return (
    <Page titre="Accueil" largeur="large">
      <div className="accueil__entete">
        <AvatarInitiales nom={profil?.nomComplet} />
        <div className="extensible">
          <p className="accueil__bonjour">Bonjour,</p>
          <p className="titre accueil__nom une-ligne">{profil?.nomComplet ?? ' '}</p>
        </div>
        <BoutonRond icone={RefreshCw} libelle="Actualiser" onClick={toutRecharger} />
      </div>

      <div className="accueil__grille">
        <div className="pile" style={{ gap: 14 }}>
          <CarteStatut profil={profil} statutEnCours={statutEnCours} onChoisir={choisirStatut} />

          {tourneeEnCours && <AFaireTournee tournee={tourneeEnCours} />}
          {missionEnCours && <AFaireMission mission={missionEnCours} />}

          {missions.donnees?.especesDetenues > 0 && <CarteEspeces montant={missions.donnees.especesDetenues} />}
        </div>

        <div className="pile" style={{ gap: 22 }}>
          {estLivreurDomicile && (
            <section>
              <div className="titre-section">
                <h2>Livraisons</h2>
                <Link to={Routes.livraisons} className="lien">
                  Tout voir
                </Link>
              </div>
              <Liste
                etat={missions}
                elements={missions.donnees?.missions}
                vide="Aucune livraison affectée pour le moment."
                rendu={(mission) => <CarteMission key={mission.id} mission={mission} />}
              />
            </section>
          )}

          {estChauffeur && (
            <section>
              <div className="titre-section">
                <h2>Tournées</h2>
                <Link to={Routes.tournees} className="lien">
                  Tout voir
                </Link>
              </div>
              <Liste
                etat={tournees}
                elements={tournees.donnees}
                vide="Aucune tournée prévue."
                rendu={(tournee) => <CarteTournee key={tournee.id} tournee={tournee} />}
              />
            </section>
          )}

          {profil && !estLivreurDomicile && !estChauffeur && (
            <BlocGris>
              <p className="texte-secondaire" style={{ fontSize: 14 }}>
                Votre compte n'a pas encore de rôle (livraison à domicile ou tournée de ramassage). Contactez l'équipe Tôligo.
              </p>
            </BlocGris>
          )}
        </div>
      </div>
    </Page>
  );
}

/** Statut du livreur et boutons pour le changer (BF-LIV-02). */
function CarteStatut({ profil, statutEnCours, onChoisir }) {
  const { etat: etatPosition } = usePosition();
  const statut = infosStatut(profil?.statut);
  const enMission = profil?.statut === 'en_mission';
  const positionOk = etatPosition === 'partagee' || etatPosition === 'recherche';
  const IconePosition = positionOk ? LocateFixed : LocateOff;

  return (
    <div className="carte-statut">
      <div className="rangee" style={{ gap: 12 }}>
        <span className="carte-statut__point" style={{ background: statut.couleur }} aria-hidden="true" />
        <div className="extensible">
          <p className="etiquette-section" style={{ fontSize: 11.5 }}>
            Votre statut
          </p>
          <p className="titre carte-statut__libelle">{profil ? statut.libelle : '…'}</p>
        </div>
        {statutEnCours && <Roue taille="petite" />}
      </div>

      {enMission ? (
        <p className="carte-statut__note">Vous repasserez « Disponible » à la fin de votre livraison ou de votre tournée.</p>
      ) : (
        profil && (
          <div style={{ marginTop: 14 }}>
            <OngletsSegmentes
              onglets={STATUTS_DECLARABLES.map((cle) => ({ cle, libelle: infosStatut(cle).libelle }))}
              courant={statutEnCours ?? profil.statut}
              onChoisir={onChoisir}
            />
          </div>
        )
      )}

      <p className={`carte-statut__position${positionOk || etatPosition === 'inactif' ? '' : ' carte-statut__position--alerte'}`}>
        <IconePosition size={15} aria-hidden="true" />
        {texteEtatPosition(etatPosition)}
      </p>
    </div>
  );
}

/** Carte noire : la tournée démarrée à poursuivre. */
function AFaireTournee({ tournee }) {
  const naviguer = useNavigate();
  return (
    <div className="carte-sombre" {...cliquable(() => naviguer(Routes.tournee(tournee.id)))}>
      <p className="carte-sombre__surtitre">À faire maintenant</p>
      <div className="rangee" style={{ gap: 12 }}>
        <span className="carte-sombre__icone">
          <Truck size={22} aria-hidden="true" />
        </span>
        <div className="extensible">
          <p className="titre" style={{ fontSize: 17 }}>
            Tournée en cours
          </p>
          <p className="texte-secondaire une-ligne" style={{ fontSize: 13 }}>
            {tournee.demarreeLe ? `Démarrée à ${heure(tournee.demarreeLe)} · ` : ''}
            {tournee.nbBox ?? 0} box · arrivée {tournee.station?.nom ?? ''}
          </p>
        </div>
        <span className="carte-sombre__fleche">
          <ArrowRight size={18} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

/** Carte noire : la livraison commencée à poursuivre. */
function AFaireMission({ mission }) {
  const naviguer = useNavigate();
  return (
    <div className="carte-sombre" {...cliquable(() => naviguer(Routes.livraison(mission.id)))}>
      <p className="carte-sombre__surtitre">À faire maintenant</p>
      <div className="rangee" style={{ gap: 12 }}>
        <span className="carte-sombre__icone">
          <Package size={22} aria-hidden="true" />
        </span>
        <div className="extensible">
          <p className="titre une-ligne" style={{ fontSize: 17 }}>
            Livraison pour {prenom(mission.destinataire.nom) || 'le destinataire'}
          </p>
          <p className="texte-secondaire une-ligne" style={{ fontSize: 13 }}>
            {infosStatutMission(mission.statut).libelle} · {mission.destinataire.adresse}
          </p>
        </div>
        <span className="carte-sombre__fleche">
          <ArrowRight size={18} aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}

/** Liste courte de l'accueil (3 éléments) avec ses états : chargement, erreur, vide. */
function Liste({ etat, elements, vide, rendu }) {
  if (etat.erreur && etat.donnees === undefined) return <VueErreur erreur={etat.erreur} onReessayer={etat.recharger} />;
  if (!elements) {
    return (
      <div style={{ padding: 16, textAlign: 'center' }}>
        <Roue />
      </div>
    );
  }
  if (elements.length === 0) {
    return (
      <BlocGris>
        <p className="texte-secondaire" style={{ fontSize: 13.5 }}>
          {vide}
        </p>
      </BlocGris>
    );
  }
  return <Cascade className="pile" style={{ gap: 10 }}>{elements.slice(0, 3).map(rendu)}</Cascade>;
}
