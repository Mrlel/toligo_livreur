import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Marker } from 'react-leaflet';
import { Banknote, Check, LocateFixed, MapPin, MessageSquareText, Navigation, Phone, ScanLine, Truck } from 'lucide-react';

import {
  AvatarInitiales,
  BoutonRond,
  Bouton,
  Cascade,
  EnTete,
  Illustration,
  Page,
  Pastille,
  PiedDAction,
  VueDonnees,
  useMessages,
} from '../../composants';
import { Cadrage, CarteOsm, coordonnees, distanceKm, iconeClient, iconeEpingle, lienItineraire } from '../../commun/carte';
import { usePosition } from '../../commun/Position';
import { Routes } from '../../commun/routes';
import { useSession } from '../../session/Session';
import { distance, heure, prenom, prix } from '../../utils/formatage';
import { afficher as afficherTelephone } from '../../utils/telephone';
import { useActualisation, useDonnees } from '../../utils/useDonnees';
import { confirmerAdresse, detailMission, illustrationColis, infosStatutMission, nomVehicule, partir } from './api';
import './livraisons.css';

/**
 * Livraison à domicile (CDC V3.3 §13.4), une étape à la fois (maquettes
 * LV-Liv-*) :
 * 1. Prendre — colis à prendre en station, véhicule, « Prendre les colis »
 *    (scan, écran PrisePage) ;
 * 2. Confirmer — appeler ou écrire au destinataire, puis « Partir » ;
 * 3. Partir — carte, destinataire, « Je suis arrivé » ;
 * 4. Remettre — écran RemisePage (codes, encaissement).
 * Mission close : écran de fin.
 */
export default function LivraisonPage() {
  const { id } = useParams();
  const mission = useDonnees(() => detailMission(id), [id]);
  // Rechargée au retour sur l'application (après l'appel au destinataire...).
  useActualisation(mission.recharger, 0);

  return (
    <VueDonnees etat={mission} messageChargement="Chargement de la mission…">
      {(m) => {
        if (m.statut === 'affectee') return <EtapePrendre mission={m} />;
        if (m.statut === 'recuperee' || m.statut === 'adresse_confirmee') return <EtapeConfirmer mission={m} onMiseAJour={mission.recharger} />;
        if (m.statut === 'en_route_livraison') return <EtapeEnRoute mission={m} />;
        return <Navigate to={Routes.finLivraison(m.id)} replace />;
      }}
    </VueDonnees>
  );
}

/** 1. Prendre · 2. Confirmer · 3. Partir · 4. Remettre — `courante` de 1 à 4. */
export function EtapesLivraison({ courante }) {
  const etapes = ['Prendre', 'Confirmer', 'Partir', 'Remettre'];
  return (
    <div className="etapes-livraison" aria-label={`Étape ${courante} sur 4`}>
      {etapes.map((libelle, i) => {
        const rang = i + 1;
        const classe = rang < courante ? ' etapes-livraison__etape--faite' : rang === courante ? ' etapes-livraison__etape--courante' : '';
        return (
          <span key={libelle} className={`etapes-livraison__etape${classe}`}>
            {rang}. {libelle}
          </span>
        );
      })}
    </div>
  );
}

/** Carte du destinataire : nom, téléphone, adresse et repère (et le montant à encaisser). */
export function CarteDestinataire({ mission, avecPaiement = false }) {
  const { destinataire } = mission;
  const repere = destinataire.repere ?? (destinataire.lieuProche ? `près de ${destinataire.lieuProche.nom}` : null);

  return (
    <div className="carte destinataire">
      <div className="rangee" style={{ gap: 14 }}>
        <AvatarInitiales nom={destinataire.nom} taille={52} accent />
        <div className="extensible">
          <p className="destinataire__nom une-ligne">{destinataire.nom || 'Destinataire'}</p>
          <p className="texte-secondaire">{destinataire.telephone ? `+225 ${afficherTelephone(destinataire.telephone)}` : ''}</p>
        </div>
      </div>
      <div className="destinataire__adresse">
        <MapPin size={20} aria-hidden="true" />
        <div>
          <p className="gras">{destinataire.adresse}</p>
          {repere && <p className="texte-secondaire">Repère : {repere}</p>}
          {destinataire.instructions && <p className="texte-secondaire">« {destinataire.instructions} »</p>}
        </div>
      </div>
      {avecPaiement && mission.montantAEncaisser > 0 && (
        <div className="destinataire__paiement">
          <Banknote size={20} aria-hidden="true" />
          <span className="extensible">Paiement à la livraison</span>
          <span className="destinataire__montant">{prix(mission.montantAEncaisser)}</span>
        </div>
      )}
    </div>
  );
}

/** Ligne d'un colis : illustration du format, code de suivi, précision. */
export function LigneColis({ colis, detail, fin }) {
  return (
    <div className="liste-carte__ligne">
      <span className="vignette-colis">
        <Illustration nom={illustrationColis(colis.format)} taille={34} carre={false} />
      </span>
      <span className="liste-carte__texte">
        <span className="liste-carte__titre" style={{ display: 'block', letterSpacing: 0.2 }}>
          {colis.codeSuivi}
        </span>
        <span className="liste-carte__detail" style={{ display: 'block' }}>
          {detail}
        </span>
      </span>
      {fin}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Prendre les colis (maquette LV-Liv-Tournee)
// ---------------------------------------------------------------------------
function EtapePrendre({ mission }) {
  const naviguer = useNavigate();
  const statut = infosStatutMission(mission.statut);

  return (
    <Page
      titre="Mission en cours"
      entete={<EnTete titre="Mission en cours" sousTitre={`${mission.reference} · ${statut.libelle}`} gris repli={Routes.livraisons} />}
      pied={
        <PiedDAction arrondi>
          <Bouton icone={ScanLine} onClick={() => naviguer(Routes.prise(mission.id))}>
            Prendre les colis
          </Bouton>
        </PiedDAction>
      }
    >
      <EtapesLivraison courante={1} />
      <div className="pile" style={{ gap: 14 }}>
        <CarteDestinataire mission={mission} avecPaiement />

        <section>
          <div className="titre-bloc">
            <span className="etiquette-section">Colis à prendre</span>
            {mission.station && <span className="titre-bloc__precision">{mission.station.nom}</span>}
          </div>
          <Cascade className="liste-carte">
            {mission.colis.map((colis) => (
              <LigneColis key={colis.codeSuivi} colis={colis} detail={`${colis.format ?? 'Colis'} · arrivé en station`} />
            ))}
          </Cascade>
        </section>

        {mission.vehicule && (
          <div className="ligne-vehicule">
            <span className="ligne-vehicule__icone" aria-hidden="true">
              <Truck size={20} />
            </span>
            <span>
              <b>{nomVehicule(mission.vehicule)}</b> · véhicule de la mission
            </span>
          </div>
        )}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// 2. Confirmer l'adresse (maquette LV-Liv-Appel)
// ---------------------------------------------------------------------------
function EtapeConfirmer({ mission, onMiseAJour }) {
  const { afficherMessage, afficherErreur } = useMessages();
  const { rechargerProfil } = useSession();
  const [mode, setMode] = useState(null); // 'appel' | 'sms' : dernier contact lancé
  const [enCours, setEnCours] = useState(false);

  const confirmee = mission.statut === 'adresse_confirmee';
  const nom = prenom(mission.destinataire.nom) || 'le destinataire';
  const telephone = mission.destinataire.telephone;

  async function executer(appel, message) {
    setEnCours(true);
    try {
      await appel();
      afficherMessage(message);
      onMiseAJour();
      rechargerProfil();
    } catch (erreur) {
      afficherErreur(erreur);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Page
      titre="Confirmer l'adresse"
      entete={<EnTete titre="Confirmer l’adresse" sousTitre="Avant de quitter la station" gris repli={Routes.livraisons} />}
      pied={
        <PiedDAction arrondi>
          {confirmee ? (
            <Bouton icone={Navigation} enCours={enCours} onClick={() => executer(() => partir(mission.id), 'Bonne route ! Le destinataire suit votre livraison.')}>
              Partir en livraison
            </Bouton>
          ) : (
            <Bouton
              icone={Check}
              enCours={enCours}
              disabled={!mode}
              onClick={() => executer(() => confirmerAdresse(mission.id, mode), 'Adresse confirmée.')}
            >
              {mode ? `${nom} a confirmé l’adresse` : `Appelez ou écrivez d’abord à ${nom}`}
            </Bouton>
          )}
        </PiedDAction>
      }
    >
      <EtapesLivraison courante={2} />
      <div className="pile" style={{ gap: 14 }}>
        <CarteDestinataire mission={mission} />

        <section>
          <div className="titre-bloc">
            <span className="etiquette-section">Appelez ou écrivez à {nom}</span>
          </div>
          <div className="contact-destinataire">
            <a className="bouton bouton--principal" href={`tel:${telephone}`} onClick={() => setMode('appel')}>
              <Phone size={20} aria-hidden="true" />
              <span>Appeler</span>
            </a>
            <a className="bouton bouton--secondaire" href={`sms:${telephone}`} onClick={() => setMode((ancien) => ancien ?? 'sms')}>
              <MessageSquareText size={20} aria-hidden="true" />
              <span>SMS</span>
            </a>
          </div>
        </section>

        {confirmee && (
          <div className="bandeau-succes">
            <span className="bandeau-succes__rond">
              <Check size={16} strokeWidth={3} aria-hidden="true" />
            </span>
            Adresse confirmée{mission.modeConfirmationAdresse === 'sms' ? ' par SMS' : mission.modeConfirmationAdresse === 'appel' ? ' par appel' : ''}
            {mission.adresseConfirmeeLe ? ` à ${heure(mission.adresseConfirmeeLe)}` : ''}
          </div>
        )}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// 3. En route (maquette LV-Liv-Navigation) : carte, destinataire, arrivée.
// Le guidage pas à pas passe par Google Maps ou Waze (décision du 25/11).
// ---------------------------------------------------------------------------
function EtapeEnRoute({ mission }) {
  const naviguer = useNavigate();
  const { position } = usePosition();
  const destination = coordonnees(mission.destinataire);
  const reste = position && destination ? distanceKm(position, destination) : null;
  const points = [position, destination].filter(Boolean);

  return (
    <Page titre="En livraison" largeur="large" className="page--navigation">
      <div className="navigation">
        <div className="navigation__carte">
          {points.length > 0 ? (
            <CarteOsm centre={points[0]} zoom={14}>
              {destination && <Marker position={destination} icon={iconeEpingle()} />}
              {position && <Marker position={position} icon={iconeClient()} />}
              <Cadrage points={points} marge={70} />
            </CarteOsm>
          ) : (
            <div className="navigation__sans-carte">Adresse sans position sur la carte</div>
          )}

          <div className="navigation__haut">
            <BoutonRond libelle="Retour" onClick={() => naviguer(Routes.livraisons)} />
            {destination ? (
              <a className="navigation__consigne" href={lienItineraire(destination[0], destination[1])} target="_blank" rel="noreferrer">
                <Navigation size={22} aria-hidden="true" />
                <span className="extensible">
                  <span className="navigation__consigne-titre">Itinéraire dans Google Maps</span>
                  <span className="navigation__consigne-texte une-ligne">{mission.destinataire.adresse}</span>
                </span>
              </a>
            ) : (
              <span className="navigation__consigne">
                <span className="navigation__consigne-titre">{mission.destinataire.adresse}</span>
              </span>
            )}
          </div>
          {position && (
            <span className="navigation__position" aria-hidden="true">
              <LocateFixed size={22} />
            </span>
          )}
        </div>

        <div className="navigation__feuille">
          <span className="navigation__poignee" aria-hidden="true" />
          <div className="rangee" style={{ gap: 12, alignItems: 'flex-start' }}>
            <div className="extensible">
              <p className="navigation__distance">
                {reste !== null ? distance(reste) : 'En route'}
                {reste !== null && <span> · à vol d’oiseau</span>}
              </p>
              <p className="texte-secondaire">
                {mission.colis.length} colis en livraison
              </p>
            </div>
            <Pastille ton="accent">3. Partir</Pastille>
          </div>

          <div className="navigation__destinataire">
            <AvatarInitiales nom={mission.destinataire.nom} taille={44} accent />
            <div className="extensible">
              <p className="gras une-ligne">{mission.destinataire.nom}</p>
              <p className="texte-secondaire une-ligne" style={{ fontSize: 13.5 }}>
                {mission.destinataire.adresse}
              </p>
            </div>
            <a className="navigation__rond" href={`sms:${mission.destinataire.telephone}`} aria-label="Écrire un SMS">
              <MessageSquareText size={20} />
            </a>
            <a className="navigation__rond navigation__rond--noir" href={`tel:${mission.destinataire.telephone}`} aria-label="Appeler">
              <Phone size={20} />
            </a>
          </div>

          <Bouton icone={MapPin} onClick={() => naviguer(Routes.remise(mission.id))}>
            Je suis arrivé
          </Bouton>
          <button type="button" className="lien-rouge" onClick={() => naviguer(Routes.echec(mission.id))}>
            Livraison impossible
          </button>
        </div>
      </div>
    </Page>
  );
}
