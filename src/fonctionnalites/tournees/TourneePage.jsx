import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import L from 'leaflet';
import { Marker } from 'react-leaflet';
import { CircleCheck, Flag, LockOpen, Navigation, Package, PackageCheck, Play, ScanLine, TriangleAlert, Truck, Warehouse } from 'lucide-react';

import {
  BarreProgression,
  BlocGris,
  Bouton,
  Carte,
  Cascade,
  Champ,
  EncadreInfo,
  EnTete,
  IconeBox,
  LigneInfo,
  Modale,
  Page,
  Pastille,
  PetitBouton,
  PiedDAction,
  Puce,
  VueDonnees,
  useConfirmation,
  useMessages,
} from '../../composants';
import { Cadrage, CarteOsm, coordonnees, iconeClient, iconeStation, lienItineraire } from '../../commun/carte';
import { usePosition } from '../../commun/Position';
import { Routes } from '../../commun/routes';
import { Scanner } from '../../commun/Scanner';
import { useSession } from '../../session/Session';
import { heure, majuscule, moment } from '../../utils/formatage';
import { useActualisation, useDonnees } from '../../utils/useDonnees';
import { libelleVehicule } from '../profil/api';
import {
  demarrerTournee,
  detailTournee,
  infosEtatPassage,
  ouvrirBox,
  scannerDepot,
  scannerRamassage,
  signalerAnomalie,
  terminerTournee,
} from './api';
import './tournees.css';

/**
 * Tournée de ramassage, côté chauffeur (CDC V3.3 §13.3).
 *
 * - Prévue : résumé et bouton « Démarrer ».
 * - En cours : les arrêts (sites) et leurs box ; à chaque box, « Ouvrir »,
 *   « Scanner » les colis pris, ou « Anomalie ». Puis le dépôt à la station :
 *   scanner chaque colis déposé, et terminer.
 *
 * Le bouton du bas propose toujours l'étape suivante : scanner les colis
 * tant qu'il reste des box à vider, puis scanner les dépôts, puis terminer.
 */
export default function TourneePage() {
  const { id } = useParams();
  const naviguer = useNavigate();
  const confirmer = useConfirmation();
  const { afficherMessage, afficherErreur } = useMessages();
  const { rechargerProfil } = useSession();

  const detail = useDonnees(() => detailTournee(id), [id]);
  useActualisation(detail.recharger, 0);

  const [enCours, setEnCours] = useState(null); // 'demarrer' | 'terminer' | 'ouvrir-<passage>'
  const [scan, setScan] = useState(null); // 'ramassage' | 'depot'
  const [passageAnomalie, setPassageAnomalie] = useState(null);

  async function demarrer() {
    const ok = await confirmer({
      titre: 'Démarrer la tournée ?',
      texte: 'Tôligo ajoute à la tournée les box qui contiennent un colis. Votre statut passe à « En mission ».',
      accepter: 'Démarrer',
    });
    if (!ok) return;
    setEnCours('demarrer');
    try {
      await demarrerTournee(id);
      afficherMessage('Tournée démarrée. Bonne route !');
      detail.recharger();
      rechargerProfil();
    } catch (erreur) {
      afficherErreur(erreur);
    } finally {
      setEnCours(null);
    }
  }

  async function ouvrir(passage) {
    setEnCours(`ouvrir-${passage.id}`);
    try {
      await ouvrirBox(id, passage.id);
      afficherMessage(`Box ${passage.box?.numero ?? ''} ouvert.`);
    } catch (erreur) {
      afficherErreur(erreur);
    } finally {
      setEnCours(null);
    }
  }

  async function terminer(tournee, aBord) {
    const restants = tournee.passages.filter((p) => p.etat === 'a_visiter').length;
    if (aBord.length > 0) {
      afficherMessage(`Déposez d'abord les ${aBord.length} colis encore à bord : scannez-les à la station.`);
      return;
    }
    const ok = await confirmer({
      titre: 'Terminer la tournée ?',
      texte:
        restants > 0
          ? `${restants} box n'${restants > 1 ? 'ont' : 'a'} pas été vidé${restants > 1 ? 's' : ''} : ${restants > 1 ? 'ils seront signalés' : 'il sera signalé'} et les colis attendront la prochaine tournée.`
          : 'Tous les colis ramassés sont déposés à la station.',
      accepter: 'Terminer',
      danger: restants > 0,
    });
    if (!ok) return;
    setEnCours('terminer');
    try {
      await terminerTournee(id);
      afficherMessage('Tournée terminée. Merci !');
      detail.recharger();
      rechargerProfil();
    } catch (erreur) {
      afficherErreur(erreur);
    } finally {
      setEnCours(null);
    }
  }

  const donnees = detail.donnees;
  const tournee = donnees?.tournee;

  return (
    <Page
      titre="Tournée"
      largeur="moyenne"
      entete={<EnTete titre="Tournée de ramassage" sousTitre={tournee?.station ? `Arrivée : ${tournee.station.nom}` : undefined} repli={Routes.tournees} />}
      pied={
        donnees && (
          <PiedTournee
            tournee={tournee}
            aBord={donnees.aBord}
            enCours={enCours}
            onDemarrer={demarrer}
            onScanner={setScan}
            onTerminer={() => terminer(tournee, donnees.aBord)}
            onRetour={() => naviguer(Routes.tournees)}
          />
        )
      }
    >
      <VueDonnees etat={detail} messageChargement="Chargement de la tournée…">
        {({ tournee: t, aBord }) =>
          t.statut === 'planifiee' ? (
            <TourneePrevue tournee={t} />
          ) : (
            <TourneeEnCours
              tournee={t}
              aBord={aBord}
              enCours={enCours}
              onOuvrir={ouvrir}
              onScanner={setScan}
              onAnomalie={setPassageAnomalie}
            />
          )
        }
      </VueDonnees>

      <Scanner
        ouverte={scan !== null}
        onFermer={() => setScan(null)}
        titre={scan === 'depot' ? 'Dépôt à la station' : 'Ramassage'}
        aide={
          scan === 'depot'
            ? `Scannez chaque colis que vous déposez à ${tournee?.station?.nom ?? 'la station'}.`
            : 'Scannez chaque colis que vous prenez dans le box.'
        }
        traiter={async (code) => {
          if (scan === 'depot') await scannerDepot(id, code);
          else await scannerRamassage(id, code);
          detail.recharger();
          return scan === 'depot' ? 'Déposé à la station.' : 'Pris en charge : il est à bord.';
        }}
      />

      <FenetreAnomalie
        passage={passageAnomalie}
        onFermer={() => setPassageAnomalie(null)}
        onEnregistrer={async (commentaire) => {
          try {
            await signalerAnomalie(id, passageAnomalie.id, commentaire);
            afficherMessage("Anomalie signalée à l'équipe Tôligo.");
            setPassageAnomalie(null);
            detail.recharger();
          } catch (erreur) {
            afficherErreur(erreur);
          }
        }}
      />
    </Page>
  );
}

/** Tournée pas encore démarrée : quand, où, avec quel camion. */
function TourneePrevue({ tournee }) {
  return (
    <div className="pile" style={{ gap: 14 }}>
      <BlocGris style={{ padding: 4 }}>
        <LigneInfo libelle="Prévue" valeur={tournee.planifieeLe ? majuscule(moment(tournee.planifieeLe)) : 'À préciser'} />
        <LigneInfo libelle="Arrivée" valeur={tournee.station?.nom ?? '—'} />
        {tournee.vehicule && (
          <LigneInfo libelle={libelleVehicule(tournee.vehicule.type)} valeur={tournee.vehicule.immatriculation} />
        )}
      </BlocGris>

      <section>
        <div className="titre-section">
          <h2>Sites à visiter</h2>
        </div>
        {!tournee.entrepots || tournee.entrepots.length === 0 ? (
          <BlocGris>
            <p className="demi-gras">Tous les sites de la station</p>
            <p className="texte-secondaire" style={{ fontSize: 13, marginTop: 2 }}>
              Ceux desservis par {tournee.station?.nom ?? 'la station'}.
            </p>
          </BlocGris>
        ) : (
          <Cascade className="pile" style={{ gap: 8 }}>
            {tournee.entrepots.map((site) => (
              <Carte key={site.id} ombre={false}>
                <div className="rangee" style={{ gap: 12 }}>
                  <span className="vignette">
                    <Warehouse size={20} aria-hidden="true" />
                  </span>
                  <div className="extensible">
                    <p className="gras une-ligne">{site.nom}</p>
                    <p className="texte-secondaire une-ligne" style={{ fontSize: 13 }}>
                      {site.adresse}
                    </p>
                  </div>
                </div>
              </Carte>
            ))}
          </Cascade>
        )}
      </section>

      <EncadreInfo>Au démarrage, Tôligo ajoute à la tournée les box de ces sites qui contiennent un colis, dans l'ordre de passage conseillé.</EncadreInfo>
    </div>
  );
}

/** Tournée démarrée (ou close) : progression, arrêts et box, dépôt à la station. */
function TourneeEnCours({ tournee, aBord, enCours, onOuvrir, onScanner, onAnomalie }) {
  const total = tournee.passages.length;
  const traites = tournee.passages.filter((p) => p.etat !== 'a_visiter').length;
  const active = tournee.statut === 'en_cours';

  return (
    <div className="colonnes">
      <div className="pile" style={{ gap: 18 }}>
        {tournee.statut === 'terminee' && (
          <div className="bilan bilan--succes">
            <CircleCheck size={26} aria-hidden="true" />
            <div>
              <p className="bilan__titre">Tournée terminée</p>
              <p className="bilan__texte">
                {tournee.termineeLe ? `Close ${moment(tournee.termineeLe)}. ` : ''}Merci !
              </p>
            </div>
          </div>
        )}

        {active && (
          <div className="carte-sombre">
            <div className="rangee" style={{ gap: 12 }}>
              <span className="carte-sombre__icone">
                <Truck size={22} aria-hidden="true" />
              </span>
              <div className="extensible">
                <p className="titre" style={{ fontSize: 17 }}>
                  {traites} box sur {total} traité{traites > 1 ? 's' : ''}
                </p>
                <p className="texte-secondaire" style={{ fontSize: 13 }}>
                  {tournee.demarreeLe ? `Démarrée à ${heure(tournee.demarreeLe)}` : 'En cours'} · {aBord.length} colis à bord
                </p>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <BarreProgression valeur={total === 0 ? 0 : traites / total} />
            </div>
          </div>
        )}

        <section>
          <div className="titre-section">
            <h2>Ramassage</h2>
            <span className="texte-secondaire" style={{ fontSize: 13 }}>
              {tournee.arrets.length} arrêt{tournee.arrets.length > 1 ? 's' : ''}
            </span>
          </div>
          <Cascade className="pile" style={{ gap: 14 }}>
            {tournee.arrets.map((arret, rang) => (
              <ArretTournee
                key={arret.entrepot?.id ?? rang}
                arret={arret}
                rang={rang}
                active={active}
                enCours={enCours}
                onOuvrir={onOuvrir}
                onScanner={() => onScanner('ramassage')}
                onAnomalie={onAnomalie}
              />
            ))}
          </Cascade>
        </section>
      </div>

      <div className="colonnes__droite pile" style={{ gap: 14 }}>
        <CarteTournee tournee={tournee} />

        <section className="depot-station">
          <div className="rangee" style={{ gap: 12 }}>
            <span className="vignette" style={{ background: 'var(--blanc)' }}>
              <Flag size={20} aria-hidden="true" />
            </span>
            <div className="extensible">
              <p className="etiquette-section" style={{ fontSize: 11.5 }}>
                Dépôt à la station
              </p>
              <p className="gras une-ligne">{tournee.station?.nom ?? '—'}</p>
            </div>
            {coordonnees(tournee.station) && (
              <a
                className="petit-bouton rangee"
                style={{ gap: 6, textDecoration: 'none', background: 'var(--blanc)' }}
                href={lienItineraire(tournee.station.latitude, tournee.station.longitude)}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation size={15} aria-hidden="true" /> Y aller
              </a>
            )}
          </div>

          <p className="etiquette-section" style={{ margin: '16px 0 4px' }}>
            À bord · {aBord.length}
          </p>
          {aBord.length === 0 ? (
            <p className="texte-secondaire" style={{ fontSize: 13.5 }}>
              Aucun colis dans le camion.
            </p>
          ) : (
            aBord.map((colis) => (
              <div className="ligne-colis" key={colis.codeSuivi}>
                <Package size={18} aria-hidden="true" className="texte-secondaire" />
                <div className="extensible">
                  <p className="ligne-colis__code">{colis.codeSuivi}</p>
                  {colis.format && <p className="ligne-colis__format">{colis.format}</p>}
                </div>
              </div>
            ))
          )}

          {active && aBord.length > 0 && (
            <Bouton variante="contour" compact icone={PackageCheck} onClick={() => onScanner('depot')} style={{ marginTop: 12 }}>
              Scanner les dépôts
            </Bouton>
          )}
        </section>
      </div>
    </div>
  );
}

/** Un arrêt : le site, son adresse, et ses box à vider. */
function ArretTournee({ arret, rang, active, enCours, onOuvrir, onScanner, onAnomalie }) {
  const site = arret.entrepot;
  const fini = arret.passages.every((p) => p.etat !== 'a_visiter');

  return (
    <div className={`arret${fini ? ' arret--fini' : ''}`}>
      <div className="arret__entete">
        <span className="arret__numero">{fini ? <CircleCheck size={18} aria-hidden="true" /> : rang + 1}</span>
        <div className="extensible">
          <p className="gras une-ligne">{site?.nom ?? 'Site'}</p>
          {site?.adresse && (
            <p className="texte-secondaire une-ligne" style={{ fontSize: 13 }}>
              {site.adresse}
            </p>
          )}
        </div>
        {active && !fini && coordonnees(site) && (
          <a className="petit-bouton rangee" style={{ gap: 6, textDecoration: 'none' }} href={lienItineraire(site.latitude, site.longitude)} target="_blank" rel="noreferrer">
            <Navigation size={15} aria-hidden="true" /> Y aller
          </a>
        )}
      </div>

      <div className="pile" style={{ gap: 8 }}>
        {arret.passages.map((passage) => (
          <CartePassage
            key={passage.id}
            passage={passage}
            active={active}
            ouvertureEnCours={enCours === `ouvrir-${passage.id}`}
            onOuvrir={() => onOuvrir(passage)}
            onScanner={onScanner}
            onAnomalie={() => onAnomalie(passage)}
          />
        ))}
      </div>
    </div>
  );
}

/** Un box de la tournée : son état, ses colis, et les actions possibles. */
function CartePassage({ passage, active, ouvertureEnCours, onOuvrir, onScanner, onAnomalie }) {
  const etat = infosEtatPassage(passage.etat);
  const aVider = passage.etat === 'a_visiter';

  return (
    <Carte className={`passage passage--${passage.etat}`} ombre={aVider}>
      <div className="rangee" style={{ gap: 12 }}>
        <span className="vignette">
          <IconeBox size={22} />
        </span>
        <div className="extensible">
          <p className="gras">Box {passage.box?.numero ?? '?'}</p>
          <p className="texte-secondaire" style={{ fontSize: 13 }}>
            {aVider
              ? `${passage.colisAPrendre.length} colis à prendre`
              : passage.etat === 'visite'
                ? `Vidé${passage.passeLe ? ` à ${heure(passage.passeLe)}` : ''}`
                : 'Colis laissés pour la prochaine tournée'}
          </p>
        </div>
        <Pastille ton={etat.ton} petite>
          {etat.libelle}
        </Pastille>
      </div>

      {passage.etat === 'anomalie' && passage.commentaire && <p className="passage__commentaire">« {passage.commentaire} »</p>}

      {aVider && passage.colisAPrendre.length > 0 && (
        <div className="passage__colis">
          {passage.colisAPrendre.map((colis) => (
            <span key={colis.codeSuivi} className="passage__code">
              {colis.codeSuivi}
              {colis.format && <small>{colis.format}</small>}
            </span>
          ))}
        </div>
      )}

      {aVider && active && (
        <div className="passage__actions">
          <Bouton compact icone={LockOpen} enCours={ouvertureEnCours} onClick={onOuvrir}>
            Ouvrir
          </Bouton>
          <Bouton compact variante="contour" icone={ScanLine} onClick={onScanner}>
            Scanner
          </Bouton>
          <PetitBouton onClick={onAnomalie} aria-label="Signaler une anomalie" title="Signaler une anomalie" className="passage__anomalie">
            <TriangleAlert size={17} aria-hidden="true" />
          </PetitBouton>
        </div>
      )}
    </Carte>
  );
}

/** Repère numéroté d'un arrêt sur la carte (noir, gris une fois fini). */
function iconeArret(numero, fini) {
  return L.divIcon({
    className: 'repere-carte',
    html: `<span class="repere-arret${fini ? ' repere-arret--fini' : ''}">${numero}</span>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

/** Carte des arrêts et de la station d'arrivée. */
function CarteTournee({ tournee }) {
  const { position } = usePosition();
  const arrets = tournee.arrets
    .map((arret, rang) => ({ arret, rang, point: coordonnees(arret.entrepot) }))
    .filter(({ point }) => point !== null);
  const station = coordonnees(tournee.station);

  const points = [...arrets.map(({ point }) => point), station].filter(Boolean);
  if (points.length === 0) return null;

  return (
    <div className="cadre-carte">
      <CarteOsm centre={points[0]} zoom={13}>
        {arrets.map(({ arret, rang, point }) => (
          <Marker
            key={arret.entrepot.id || rang}
            position={point}
            icon={iconeArret(rang + 1, arret.passages.every((p) => p.etat !== 'a_visiter'))}
          />
        ))}
        {station && <Marker position={station} icon={iconeStation(true)} />}
        {position && tournee.statut === 'en_cours' && <Marker position={position} icon={iconeClient()} />}
        <Cadrage points={points} marge={36} />
      </CarteOsm>
    </div>
  );
}

/** Pied : l'étape suivante de la tournée. */
function PiedTournee({ tournee, aBord, enCours, onDemarrer, onScanner, onTerminer, onRetour }) {
  if (tournee.statut === 'planifiee') {
    return (
      <PiedDAction arrondi>
        <Bouton icone={Play} enCours={enCours === 'demarrer'} onClick={onDemarrer}>
          Démarrer la tournée
        </Bouton>
      </PiedDAction>
    );
  }

  if (tournee.statut !== 'en_cours') {
    return (
      <PiedDAction>
        <Bouton variante="secondaire" onClick={onRetour}>
          Retour aux tournées
        </Bouton>
      </PiedDAction>
    );
  }

  const resteDesBox = tournee.passages.some((p) => p.etat === 'a_visiter');

  if (resteDesBox) {
    return (
      <PiedDAction arrondi>
        <Bouton icone={ScanLine} onClick={() => onScanner('ramassage')}>
          Scanner un colis
        </Bouton>
        <Bouton variante="texte" icone={Flag} enCours={enCours === 'terminer'} onClick={onTerminer}>
          Terminer la tournée
        </Bouton>
      </PiedDAction>
    );
  }

  if (aBord.length > 0) {
    return (
      <PiedDAction arrondi entete={<p className="pied__note extensible">Box vidés : déposez les {aBord.length} colis à la station.</p>}>
        <Bouton icone={PackageCheck} onClick={() => onScanner('depot')}>
          Scanner les dépôts
        </Bouton>
      </PiedDAction>
    );
  }

  return (
    <PiedDAction arrondi>
      <Bouton variante="accent" icone={Flag} enCours={enCours === 'terminer'} onClick={onTerminer}>
        Terminer la tournée
      </Bouton>
    </PiedDAction>
  );
}

/** Raisons fréquentes, pour ne pas tout taper au téléphone. */
const RAISONS = ["Le box ne s'ouvre pas", 'Colis absent du box', 'Colis abîmé', 'Accès au site impossible'];

/** Fenêtre « Anomalie » sur un box : décrire le problème (obligatoire). */
function FenetreAnomalie({ passage, onFermer, onEnregistrer }) {
  const [commentaire, setCommentaire] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function enregistrer() {
    if (!commentaire.trim()) {
      setErreur('Décrivez le problème.');
      return;
    }
    setEnCours(true);
    await onEnregistrer(commentaire.trim());
    setEnCours(false);
    setCommentaire('');
  }

  return (
    <Modale
      ouverte={passage !== null}
      onFermer={onFermer}
      titre={`Anomalie · Box ${passage?.box?.numero ?? ''}`}
      pied={
        <Bouton variante="accent" enCours={enCours} onClick={enregistrer}>
          Signaler l'anomalie
        </Bouton>
      }
    >
      <p className="modale__texte">Les colis restent dans le box et seront proposés à la prochaine tournée. L'équipe Tôligo est prévenue.</p>
      <div className="defilement-horizontal" style={{ flexWrap: 'wrap', margin: '14px 0', outline: 'none' }} tabIndex={-1} data-focus-initial>
        {RAISONS.map((raison) => (
          <Puce
            key={raison}
            choisie={commentaire === raison}
            onClick={() => {
              setCommentaire(raison);
              setErreur(null);
            }}
          >
            {raison}
          </Puce>
        ))}
      </div>
      <Champ
        libelle="Description"
        multiligne
        bordee
        value={commentaire}
        maxLength={1000}
        erreur={erreur}
        placeholder="Ex. : la serrure clignote rouge, le box reste fermé"
        onChange={(e) => {
          setCommentaire(e.target.value);
          setErreur(null);
        }}
      />
    </Modale>
  );
}
