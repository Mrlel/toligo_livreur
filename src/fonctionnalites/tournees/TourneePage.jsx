import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import L from 'leaflet';
import { Marker } from 'react-leaflet';
import { CircleCheck, Flag, Navigation, Package, PackageCheck, Play, TriangleAlert, Truck, Users, Warehouse } from 'lucide-react';

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
  PiedDAction,
  Puce,
  VueDonnees,
  useConfirmation,
  useMessages,
} from '../../composants';
import { Cadrage, CarteOsm, coordonnees, iconeClient, iconeStation, lienItineraire } from '../../commun/carte';
import { usePosition } from '../../commun/Position';
import { Routes } from '../../commun/routes';
import { useSession } from '../../session/Session';
import { heure, majuscule, moment } from '../../utils/formatage';
import { useActualisation, useDonnees } from '../../utils/useDonnees';
import { libelleVehicule } from '../profil/api';
import { demarrerTournee, detailTournee, infosEtatPassage, signalerAnomalie, terminerPassage, terminerTournee } from './api';
import './tournees.css';

/**
 * Tournée de ramassage, côté chauffeur (CDC V3.3 §13.3). Pas de scan des
 * colis.
 *
 * - Prévue : résumé et bouton « Démarrer ».
 * - En cours : les arrêts (sites) et leurs box. Le chauffeur ouvre les box
 *   depuis l'application TTLock de l'entrepôt ; il peut signaler un problème
 *   sur un box. Une fois les colis pris, « Fin du passage » pour le site :
 *   tous les colis de ses box passent dans le camion.
 * - À la station A : « Terminer la tournée » y dépose tous les colis du
 *   camion et clôt la tournée.
 *
 * Le bouton du bas propose toujours l'étape suivante : la fin du passage au
 * prochain site, puis la fin de la tournée.
 */
export default function TourneePage() {
  const { id } = useParams();
  const naviguer = useNavigate();
  const confirmer = useConfirmation();
  const { afficherMessage, afficherErreur } = useMessages();
  const { rechargerProfil } = useSession();

  const detail = useDonnees(() => detailTournee(id), [id]);
  useActualisation(detail.recharger, 0);

  const [enCours, setEnCours] = useState(null); // 'demarrer' | 'terminer' | 'site-<entrepot>'
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

  /** Le chauffeur a pris les colis du site : ils passent dans le camion. */
  async function finirPassage(arret) {
    const site = arret.entrepot;
    const aPrendre = arret.passages.filter((p) => p.etat === 'a_visiter').reduce((total, p) => total + p.colisAPrendre.length, 0);
    const enAnomalie = arret.passages.some((p) => p.etat === 'anomalie');
    const ok = await confirmer({
      titre: `Fin du passage à ${site?.nom ?? 'ce site'} ?`,
      texte:
        `Confirmez que vous avez pris les colis des box${aPrendre > 0 ? ` (${aPrendre} colis)` : ''} : ils passent dans le camion.` +
        (enAnomalie ? ' Les box signalés en anomalie gardent leurs colis.' : ''),
      accepter: 'Colis récupérés',
    });
    if (!ok) return;
    setEnCours(`site-${site.id}`);
    try {
      const { aBord } = await terminerPassage(id, site.id);
      afficherMessage(`Passage terminé : ${aBord.length} colis à bord.`);
      detail.recharger();
    } catch (erreur) {
      afficherErreur(erreur);
    } finally {
      setEnCours(null);
    }
  }

  /** À la station A : dépose les colis du camion et clôt la tournée. */
  async function terminer(tournee, aBord) {
    const station = tournee.station?.nom ?? 'la station';
    const sitesRestants = tournee.arrets.filter((a) => !a.passageTermine).length;
    const ok = await confirmer({
      titre: 'Terminer la tournée ?',
      texte:
        (aBord.length > 0 ? `Vous êtes à ${station} : les ${aBord.length} colis du camion y sont déposés.` : 'Aucun colis dans le camion.') +
        (sitesRestants === 1 ? " 1 site n'a pas été visité : ses colis attendront la prochaine tournée." : '') +
        (sitesRestants > 1 ? ` ${sitesRestants} sites n'ont pas été visités : leurs colis attendront la prochaine tournée.` : ''),
      accepter: aBord.length > 0 ? 'Colis déposés, terminer' : 'Terminer',
      danger: sitesRestants > 0,
    });
    if (!ok) return;
    setEnCours('terminer');
    try {
      await terminerTournee(id);
      afficherMessage(aBord.length > 0 ? `Tournée terminée : ${aBord.length} colis déposés à ${station}. Merci !` : 'Tournée terminée. Merci !');
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
            onFinirPassage={finirPassage}
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
              onFinirPassage={finirPassage}
              onAnomalie={setPassageAnomalie}
            />
          )
        }
      </VueDonnees>

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
        {tournee.finPrevueLe && <LigneInfo libelle="Fin prévue" valeur={majuscule(moment(tournee.finPrevueLe))} />}
        <LigneInfo libelle="Arrivée" valeur={tournee.station?.nom ?? '—'} />
        {tournee.vehicule && (
          <LigneInfo libelle={libelleVehicule(tournee.vehicule.type)} valeur={tournee.vehicule.immatriculation || '—'} />
        )}
      </BlocGris>

      <EquipeTournee tournee={tournee} />

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
function TourneeEnCours({ tournee, aBord, enCours, onFinirPassage, onAnomalie }) {
  const total = tournee.arrets.length;
  const traites = tournee.arrets.filter((a) => a.passageTermine).length;
  const active = tournee.statut === 'en_cours';
  // Un aide suit la tournée sans « Fin du passage » ni signalement.
  const pilote = active && tournee.monRole !== 'aide';

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
                  {traites} site{traites > 1 ? 's' : ''} sur {total} visité{traites > 1 ? 's' : ''}
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
                active={pilote}
                enCours={enCours}
                onFinirPassage={() => onFinirPassage(arret)}
                onAnomalie={onAnomalie}
              />
            ))}
          </Cascade>
        </section>
      </div>

      <div className="colonnes__droite pile" style={{ gap: 14 }}>
        <CarteTournee tournee={tournee} />

        <EquipeTournee tournee={tournee} />

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

          {pilote && aBord.length > 0 && (
            <p className="texte-secondaire" style={{ fontSize: 13, marginTop: 10 }}>
              « Terminer la tournée », à la station, y dépose ces colis.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

/** Équipe de la tournée : le chauffeur (il la pilote) et ses aides. */
function EquipeTournee({ tournee }) {
  if (!tournee.chauffeur && tournee.aides.length === 0) return null;

  return (
    <section>
      <div className="titre-section">
        <h2>Équipe</h2>
        <Users size={18} aria-hidden="true" className="texte-secondaire" />
      </div>
      <BlocGris style={{ padding: 4 }}>
        {tournee.chauffeur && <LigneInfo libelle="Chauffeur" valeur={tournee.chauffeur.nomComplet} />}
        {tournee.aides.map((aide) => (
          <LigneInfo key={aide.id} libelle="Aide" valeur={aide.nomComplet} />
        ))}
      </BlocGris>
    </section>
  );
}

/** Un arrêt : le site, son adresse, ses box à vider, et « Fin du passage ». */
function ArretTournee({ arret, rang, active, enCours, onFinirPassage, onAnomalie }) {
  const site = arret.entrepot;
  const fini = arret.passageTermine;

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
            onAnomalie={() => onAnomalie(passage)}
          />
        ))}
      </div>

      {active && !fini && site?.id && (
        <Bouton variante="contour" icone={PackageCheck} enCours={enCours === `site-${site.id}`} onClick={onFinirPassage} style={{ marginTop: 10 }}>
          Fin du passage
        </Bouton>
      )}
    </div>
  );
}

/** Un box de la tournée : son état, ses colis, et les actions possibles. */
function CartePassage({ passage, active, onAnomalie }) {
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
          <Bouton variante="texte" compact icone={TriangleAlert} onClick={onAnomalie} className="passage__anomalie">
            Signaler un problème
          </Bouton>
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
            icon={iconeArret(rang + 1, arret.passageTermine)}
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
function PiedTournee({ tournee, aBord, enCours, onDemarrer, onFinirPassage, onTerminer, onRetour }) {
  if (tournee.monRole === 'aide') {
    return (
      <PiedDAction entete={<p className="pied__note extensible">Vous êtes aide : {tournee.chauffeur?.nomComplet ?? 'le chauffeur'} pilote la tournée.</p>}>
        <Bouton variante="secondaire" onClick={onRetour}>
          Retour aux tournées
        </Bouton>
      </PiedDAction>
    );
  }

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

  // Prochain site à visiter, dans l'ordre de passage.
  const prochain = tournee.arrets.find((a) => !a.passageTermine && a.entrepot?.id);

  if (prochain) {
    return (
      <PiedDAction arrondi entete={<p className="pied__note extensible">Prochain arrêt : {prochain.entrepot.nom}</p>}>
        <Bouton icone={PackageCheck} enCours={enCours === `site-${prochain.entrepot.id}`} onClick={() => onFinirPassage(prochain)}>
          Fin du passage
        </Bouton>
        <Bouton variante="texte" icone={Flag} enCours={enCours === 'terminer'} onClick={onTerminer}>
          Terminer la tournée
        </Bouton>
      </PiedDAction>
    );
  }

  return (
    <PiedDAction
      arrondi
      entete={
        aBord.length > 0 && (
          <p className="pied__note extensible">
            Sites visités : à {tournee.station?.nom ?? 'la station'}, terminez la tournée pour y déposer les {aBord.length} colis.
          </p>
        )
      }
    >
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
