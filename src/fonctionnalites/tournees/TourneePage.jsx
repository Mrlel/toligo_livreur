import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import L from 'leaflet';
import { Marker, Polyline } from 'react-leaflet';
import { Check, House, Lock, Navigation, TriangleAlert, Truck, Warehouse } from 'lucide-react';

import {
  AvatarInitiales,
  Bouton,
  Cascade,
  EncadreInfo,
  EnTete,
  Illustration,
  Page,
  Pastille,
  PiedDAction,
  VueDonnees,
  useConfirmation,
  useMessages,
} from '../../composants';
import { Cadrage, CarteOsm, coordonnees, lienItineraire } from '../../commun/carte';
import { Routes } from '../../commun/routes';
import { useSession } from '../../session/Session';
import { plage, prenom } from '../../utils/formatage';
import { useActualisation, useDonnees } from '../../utils/useDonnees';
import { illustrationColis, nomVehicule } from '../livraisons/api';
import { LigneColis } from '../livraisons/LivraisonPage';
import { demarrerTournee, detailTournee, infosStatutTournee, terminerPassage, terminerTournee } from './api';
import './tournees.css';

/**
 * Tournée de ramassage (CDC V3.3 §13.3), maquettes LV-Ram-* :
 * - prévue : carte, véhicule, équipe, entrepôts à visiter, « Démarrer » ;
 * - en cours (chauffeur) : un entrepôt à la fois, ses box, « Fin du passage »
 *   (pas de scan : box ouverts avec l'application TTLock de l'entrepôt) ;
 * - tous les entrepôts visités : « Arrivée en station », « Terminer » ;
 * - en cours (aide) : avancement seulement, le chauffeur pilote.
 */
export default function TourneePage() {
  const { id } = useParams();
  const detail = useDonnees(() => detailTournee(id), [id]);
  useActualisation(detail.recharger);

  return (
    <VueDonnees etat={detail} messageChargement="Chargement de la tournée…">
      {(donnees) => <Tournee donnees={donnees} onMiseAJour={detail.recharger} />}
    </VueDonnees>
  );
}

function Tournee({ donnees, onMiseAJour }) {
  const naviguer = useNavigate();
  const confirmer = useConfirmation();
  const { afficherMessage, afficherErreur } = useMessages();
  const { rechargerProfil } = useSession();
  const [enCours, setEnCours] = useState(false);
  const { tournee, aBord } = donnees;

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

  async function finirPassage(arret, nbColis) {
    const ok = await confirmer({
      titre: `Fin du passage à ${arret.entrepot?.nom ?? 'cet entrepôt'} ?`,
      texte: nbColis > 0 ? `Les ${nbColis} colis des box passent dans le camion.` : 'Aucun colis à prendre dans ces box.',
      accepter: 'Fin du passage',
    });
    if (!ok) return;
    executer(() => terminerPassage(tournee.id, arret.entrepot.id), `Passage à ${arret.entrepot.nom} terminé.`);
  }

  async function terminer() {
    const ok = await confirmer({
      titre: 'Terminer la tournée ?',
      texte: aBord.length > 0 ? `Les ${aBord.length} colis du camion sont déposés à la ${tournee.station?.nom ?? 'station'}.` : 'Aucun colis à déposer.',
      accepter: 'Terminer',
    });
    if (!ok) return;
    executer(() => terminerTournee(tournee.id), 'Tournée terminée. Merci !');
  }

  if (tournee.statut === 'planifiee') {
    return <TourneePrevue tournee={tournee} enCours={enCours} onDemarrer={() => executer(() => demarrerTournee(tournee.id), 'Tournée démarrée. Bonne route !')} />;
  }
  if (tournee.statut === 'en_cours' && tournee.monRole === 'aide') {
    return <VueAide tournee={tournee} aBord={aBord} />;
  }

  const prochain = tournee.statut === 'en_cours' ? tournee.arrets.find((arret) => !arret.passageTermine && arret.entrepot?.id) : null;
  if (prochain) {
    return (
      <PassageEntrepot
        tournee={tournee}
        arret={prochain}
        enCours={enCours}
        onFinir={(nbColis) => finirPassage(prochain, nbColis)}
        onProbleme={() => naviguer(`${Routes.anomalie(tournee.id)}?site=${prochain.entrepot.id}`)}
      />
    );
  }
  return <ArriveeStation tournee={tournee} aBord={aBord} enCours={enCours} onTerminer={terminer} />;
}

/** « TR-261125-03 · Planifiée ». */
function sousTitreTournee(tournee) {
  return [tournee.reference, infosStatutTournee(tournee.statut).libelle].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Carte des arrêts : entrepôts numérotés, station « A », trajet pointillé.
// ---------------------------------------------------------------------------
function repere(contenu, variante) {
  return L.divIcon({
    className: 'repere-carte',
    html: `<span class="repere-arret repere-arret--${variante}">${contenu}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

const COCHE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';

/** `arrets` : [{ point, etat: 'a_venir' | 'courant' | 'fait', rang }] dans l'ordre ; puis la station. */
function CarteArrets({ arrets, station }) {
  const pointStation = coordonnees(station);
  const situes = arrets.filter((arret) => arret.point);
  const points = [...situes.map((arret) => arret.point), pointStation].filter(Boolean);
  if (points.length === 0) return null;

  // Trajet : plein (orange) jusqu'à l'arrêt en cours, pointillé ensuite.
  const indexCourant = situes.findIndex((arret) => arret.etat !== 'fait');
  const fait = indexCourant === -1 ? points : points.slice(0, indexCourant + 1);
  const reste = indexCourant === -1 ? [] : points.slice(Math.max(0, indexCourant));

  return (
    <div className="cadre-carte cadre-carte--tournee">
      <CarteOsm centre={points[0]} zoom={13}>
        {fait.length > 1 && <Polyline positions={fait} pathOptions={{ color: '#C94A0A', weight: 4 }} />}
        {reste.length > 1 && <Polyline positions={reste} pathOptions={{ color: '#121212', weight: 4, dashArray: '2 10', lineCap: 'round' }} />}
        {situes.map((arret, i) => (
          <Marker key={i} position={arret.point} icon={repere(arret.etat === 'fait' ? COCHE : String(arret.rang), arret.etat)} />
        ))}
        {pointStation && <Marker position={pointStation} icon={repere('A', 'station')} />}
        <Cadrage points={points} marge={36} />
      </CarteOsm>
    </div>
  );
}

/** Véhicule et horaires, puis l'équipe (chauffeur et aides). */
function InfoTournee({ tournee }) {
  const membres = [
    tournee.chauffeur && { ...tournee.chauffeur, role: 'chauffeur' },
    ...tournee.aides.map((aide) => ({ ...aide, role: 'aide' })),
  ].filter(Boolean);

  return (
    <div className="liste-carte">
      <div className="liste-carte__ligne">
        <span className="vignette-colis" aria-hidden="true">
          <Truck size={20} />
        </span>
        <span className="liste-carte__texte" style={{ fontSize: 15 }}>
          {tournee.vehicule ? (
            <>
              <b>{nomVehicule(tournee.vehicule)}</b>
              {tournee.vehicule.capaciteKg ? <span className="texte-secondaire"> · {tournee.vehicule.capaciteKg} kg</span> : null}
            </>
          ) : (
            <span className="texte-secondaire">Véhicule non indiqué</span>
          )}
        </span>
        <span className="texte-secondaire" style={{ whiteSpace: 'nowrap' }}>
          {plage(tournee.planifieeLe, tournee.finPrevueLe)}
        </span>
      </div>
      {membres.length > 0 && (
        <div className="liste-carte__ligne">
          <span className="avatars-equipe">
            {membres.map((membre) => (
              <AvatarInitiales
                key={membre.id}
                nom={membre.nomComplet}
                taille={40}
                accent={membre.role === 'aide'}
                fond={membre.role === 'chauffeur' ? 'var(--encre)' : undefined}
                couleur={membre.role === 'chauffeur' ? 'var(--blanc)' : undefined}
              />
            ))}
          </span>
          <span className="liste-carte__texte" style={{ fontSize: 14.5 }}>
            {membres.map((membre) => `${membre.nomComplet} (${membre.role})`).join(' · ')}
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tournée prévue (maquette LV-Ram-Tournee)
// ---------------------------------------------------------------------------
function TourneePrevue({ tournee, enCours, onDemarrer }) {
  const sites = tournee.sites ?? [];
  const pilote = tournee.monRole !== 'aide';

  return (
    <Page
      titre="Tournée de ramassage"
      entete={
        <EnTete
          titre="Tournée de ramassage"
          sousTitre={sousTitreTournee(tournee)}
          gris
          repli={Routes.tournees}
          actions={!pilote && <Pastille ton="sombre">Aide</Pastille>}
        />
      }
      pied={
        <PiedDAction arrondi>
          {pilote ? (
            <Bouton icone={Navigation} enCours={enCours} onClick={onDemarrer}>
              Démarrer la tournée
            </Bouton>
          ) : (
            <p className="texte-secondaire" style={{ textAlign: 'center', fontSize: 14 }}>
              {prenom(tournee.chauffeur?.nomComplet) || 'Le chauffeur'} démarrera la tournée.
            </p>
          )}
        </PiedDAction>
      }
    >
      <div className="pile" style={{ gap: 14 }}>
        <CarteArrets
          arrets={sites.map((site, i) => ({ point: coordonnees(site), etat: 'a_venir', rang: i + 1 }))}
          station={tournee.station}
        />
        <InfoTournee tournee={tournee} />

        <section>
          <div className="titre-bloc">
            <span className="etiquette-section">Entrepôts à visiter</span>
            <span className="titre-bloc__precision">du plus proche au plus loin</span>
          </div>
          <Cascade className="liste-carte">
            {sites.map((site, i) => (
              <div key={site.id} className="liste-carte__ligne">
                <span className="rond-arret">{i + 1}</span>
                <span className="liste-carte__texte">
                  <span className="liste-carte__titre" style={{ display: 'block' }}>
                    {site.nom}
                  </span>
                  <span className="liste-carte__detail" style={{ display: 'block' }}>
                    Box ajoutés au démarrage
                  </span>
                </span>
              </div>
            ))}
            <div className="liste-carte__ligne">
              <span className="rond-arret rond-arret--station">A</span>
              <span className="liste-carte__texte">
                <span className="liste-carte__titre" style={{ display: 'block' }}>
                  {tournee.station?.nom ?? 'Station'}
                </span>
                <span className="liste-carte__detail" style={{ display: 'block' }}>
                  Dépôt de tous les colis
                </span>
              </span>
            </div>
          </Cascade>
        </section>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Passage à un entrepôt (maquette LV-Ram-Passage)
// ---------------------------------------------------------------------------
function PassageEntrepot({ tournee, arret, enCours, onFinir, onProbleme }) {
  const rang = tournee.arrets.indexOf(arret) + 1;
  const total = tournee.arrets.length;
  const site = arret.entrepot;
  const aPrendre = arret.passages.filter((p) => p.etat === 'a_visiter').reduce((somme, p) => somme + p.colisAPrendre.length, 0);

  return (
    <Page
      titre={`Entrepôt ${rang} sur ${total}`}
      entete={
        <EnTete
          titre={`Entrepôt ${rang} sur ${total}`}
          sousTitre="Tournée en cours"
          gris
          repli={Routes.tournees}
          actions={<Pastille ton="accent">En mission</Pastille>}
        />
      }
      pied={
        <PiedDAction arrondi>
          <Bouton enCours={enCours} onClick={() => onFinir(aPrendre)}>
            Fin du passage · {aPrendre} colis
          </Bouton>
          <button type="button" className="lien-rouge" onClick={onProbleme}>
            <TriangleAlert size={20} aria-hidden="true" /> Signaler un problème
          </button>
        </PiedDAction>
      }
    >
      {/* Avancement : entrepôts, puis la station. */}
      <div className="avancement-tournee">
        {tournee.arrets.map((a, i) => (
          <span
            key={a.entrepot?.id ?? i}
            className={`avancement-tournee__etape${a.passageTermine ? ' avancement-tournee__etape--faite' : a === arret ? ' avancement-tournee__etape--courante' : ''}`}
          >
            <span className="une-ligne">{nomCourt(a.entrepot?.nom)}</span>
          </span>
        ))}
        <span className="avancement-tournee__etape">
          <span className="une-ligne">Station A</span>
        </span>
      </div>

      <div className="site-passage">
        <span className="site-passage__tuile" aria-hidden="true">
          <Warehouse size={30} />
        </span>
        <span className="extensible">
          <span className="site-passage__nom">{site.nom}</span>
          {site.adresse && <span className="site-passage__adresse">{site.adresse}</span>}
        </span>
        {coordonnees(site) && (
          <a className="site-passage__itineraire" href={lienItineraire(site.latitude, site.longitude)} target="_blank" rel="noreferrer" aria-label="Itinéraire">
            <Navigation size={22} />
          </a>
        )}
      </div>

      <div className="titre-bloc" style={{ marginTop: 18 }}>
        <span className="etiquette-section">Box de la tournée</span>
        <span className="titre-bloc__precision">{aPrendre} colis à prendre</span>
      </div>
      <Cascade className="liste-carte">
        {arret.passages.map((passage) => (
          <LigneBox key={passage.id} passage={passage} />
        ))}
      </Cascade>

      <div style={{ marginTop: 14 }}>
        <EncadreInfo icone={Lock}>Ouvrez les box avec l’application TTLock de l’entrepôt. Aucun scan : videz-les puis appuyez sur « Fin du passage ».</EncadreInfo>
      </div>
    </Page>
  );
}

/** « Entrepôt Riviera 2 » -> « Riviera 2 ». */
function nomCourt(nom) {
  return (nom ?? 'Site').replace(/^(entrep[oô]t|site|point relais)\s+/i, '');
}

/** Un box : numéro, colis à prendre (illustrations), ou exclu après un problème. */
function LigneBox({ passage }) {
  const exclu = passage.etat === 'anomalie';
  const vide = passage.etat === 'visite';
  const numero = passage.box?.numero ?? '?';

  return (
    <div className="liste-carte__ligne">
      <span className={`numero-box${exclu ? ' numero-box--exclu' : ''}`}>{numero}</span>
      <span className="liste-carte__texte">
        <span className="liste-carte__titre" style={{ display: 'block' }}>
          Box {numero}
        </span>
        <span className="liste-carte__detail" style={{ display: 'block', color: exclu ? 'var(--erreur)' : undefined }}>
          {exclu ? `${passage.commentaire ?? 'Problème'} · problème signalé` : vide ? 'Vidé' : `${passage.colisAPrendre.length} colis à prendre`}
        </span>
      </span>
      <span className="colis-box" aria-hidden="true">
        {passage.colisAPrendre.slice(0, 2).map((colis) => (
          <Illustration key={colis.codeSuivi} nom={illustrationColis(colis.format)} taille={40} carre={false} />
        ))}
      </span>
      {exclu && <Pastille ton="erreur">Exclu</Pastille>}
      {vide && <Pastille ton="succes">Vidé</Pastille>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Arrivée en station (maquette LV-Ram-Terminer), et tournée close
// ---------------------------------------------------------------------------
function ArriveeStation({ tournee, aBord, enCours, onTerminer }) {
  const naviguer = useNavigate();
  const [toutVoir, setToutVoir] = useState(false);
  const close = tournee.statut !== 'en_cours';
  const visites = tournee.arrets.filter((arret) => arret.passageTermine).length;
  const signales = tournee.passages.filter((passage) => passage.etat === 'anomalie').length;
  const affiches = toutVoir ? aBord : aBord.slice(0, 4);

  return (
    <Page
      titre={close ? 'Tournée terminée' : 'Arrivée en station'}
      entete={<EnTete titre={close ? 'Tournée terminée' : 'Arrivée en station'} sousTitre={`${tournee.station?.nom ?? 'Station'} (A)`} gris repli={Routes.tournees} />}
      pied={
        <PiedDAction arrondi>
          {close ? (
            <Bouton variante="secondaire" onClick={() => naviguer(Routes.tournees)}>
              Retour aux tournées
            </Bouton>
          ) : (
            <Bouton icone={Check} enCours={enCours} onClick={onTerminer}>
              Terminer la tournée
            </Bouton>
          )}
        </PiedDAction>
      }
    >
      <div className="tuiles-arrivee">
        <div className="tuile-arrivee">
          <span className="tuile-arrivee__nombre">{aBord.length}</span>
          <span className="tuile-arrivee__libelle">colis à bord</span>
        </div>
        <div className="tuile-arrivee">
          <span className="tuile-arrivee__nombre">{visites}</span>
          <span className="tuile-arrivee__libelle">
            entrepôt{visites > 1 ? 's' : ''} visité{visites > 1 ? 's' : ''}
          </span>
        </div>
        <div className={`tuile-arrivee${signales > 0 ? ' tuile-arrivee--accent' : ''}`}>
          <span className="tuile-arrivee__nombre">{signales}</span>
          <span className="tuile-arrivee__libelle">box signalé{signales > 1 ? 's' : ''}</span>
        </div>
      </div>

      {close ? (
        <div className="bandeau-succes" style={{ marginTop: 14 }}>
          <span className="bandeau-succes__rond">
            <Check size={16} strokeWidth={3} aria-hidden="true" />
          </span>
          Tournée terminée : colis déposés à la station.
        </div>
      ) : (
        <>
          <div className="titre-bloc" style={{ marginTop: 18 }}>
            <span className="etiquette-section">À bord du camion</span>
          </div>
          {aBord.length === 0 ? (
            <p className="texte-secondaire" style={{ fontSize: 14 }}>
              Aucun colis dans le camion.
            </p>
          ) : (
            <Cascade className="liste-carte">
              {affiches.map((colis) => (
                <LigneColis key={colis.codeSuivi} colis={colis} detail={[colis.format, colis.entrepot ? nomCourt(colis.entrepot) : null].filter(Boolean).join(' · ')} />
              ))}
              {aBord.length > 4 && !toutVoir && (
                <button type="button" className="liste-carte__ligne liste-carte__plus" onClick={() => setToutVoir(true)}>
                  Voir les {aBord.length - 4} autres colis
                </button>
              )}
            </Cascade>
          )}
          <div style={{ marginTop: 14 }}>
            <EncadreInfo icone={House}>Tous les colis sont déposés d’un coup à la station. Le gestionnaire les pèse et les mesure ensuite un par un.</EncadreInfo>
          </div>
        </>
      )}
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Vue de l'aide (maquette LV-Ram-Aide)
// ---------------------------------------------------------------------------
function VueAide({ tournee, aBord }) {
  const indexCourant = tournee.arrets.findIndex((arret) => !arret.passageTermine);

  return (
    <Page
      titre="Tournée de ramassage"
      entete={
        <EnTete
          titre="Tournée de ramassage"
          sousTitre={sousTitreTournee(tournee)}
          gris
          repli={Routes.tournees}
          actions={<Pastille ton="sombre">Aide</Pastille>}
        />
      }
    >
      <div className="pile" style={{ gap: 14 }}>
        <div className="bandeau-aide">
          <AvatarInitiales nom={tournee.chauffeur?.nomComplet} taille={44} fond="var(--blanc)" couleur="var(--encre)" />
          <p>
            <b>Vous êtes aide</b> : {tournee.chauffeur?.nomComplet ?? 'le chauffeur'} pilote la tournée.
          </p>
        </div>

        <CarteArrets
          arrets={tournee.arrets.map((arret, i) => ({
            point: coordonnees(arret.entrepot),
            rang: i + 1,
            etat: arret.passageTermine ? 'fait' : i === indexCourant ? 'courant' : 'a_venir',
          }))}
          station={tournee.station}
        />
        <InfoTournee tournee={tournee} />

        <section>
          <div className="titre-bloc">
            <span className="etiquette-section">Avancement</span>
            <span className="titre-bloc__precision">{aBord.length} colis à bord</span>
          </div>
          <Cascade className="liste-carte">
            {tournee.arrets.map((arret, i) => {
              const etat = arret.passageTermine ? 'fait' : i === indexCourant ? 'courant' : 'a_venir';
              return (
                <div key={arret.entrepot?.id ?? i} className="liste-carte__ligne">
                  <span className={`rond-arret${etat === 'fait' ? ' rond-arret--fait' : etat === 'courant' ? ' rond-arret--courant' : ''}`}>
                    {etat === 'fait' ? <Check size={16} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="liste-carte__texte">
                    <span className="liste-carte__titre" style={{ display: 'block' }}>
                      {arret.entrepot?.nom ?? 'Entrepôt'}
                    </span>
                    <span className="liste-carte__detail" style={{ display: 'block' }}>
                      {etat === 'fait' ? `Passage terminé · ${arret.passages.length} box` : etat === 'courant' ? 'En cours' : 'À venir'}
                    </span>
                  </span>
                </div>
              );
            })}
          </Cascade>
        </section>
      </div>
    </Page>
  );
}
