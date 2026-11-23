import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Marker } from 'react-leaflet';
import {
  Banknote,
  Check,
  CircleCheck,
  MessageSquareText,
  Navigation,
  Package,
  Phone,
  Send,
  TriangleAlert,
  Undo2,
  Warehouse,
} from 'lucide-react';

import {
  AvatarInitiales,
  BlocGris,
  Bouton,
  Carte,
  Champ,
  EncadreInfo,
  EnTete,
  Modale,
  Option,
  Page,
  Pastille,
  PiedDAction,
  VueDonnees,
  useConfirmation,
  useMessages,
} from '../../composants';
import { Cadrage, CarteOsm, coordonnees, iconeClient, iconeEpingle, iconeStation, lienItineraire } from '../../commun/carte';
import { usePosition } from '../../commun/Position';
import { Routes } from '../../commun/routes';
import { useSession } from '../../session/Session';
import { moment, prenom, prix } from '../../utils/formatage';
import { afficher as afficherTelephone } from '../../utils/telephone';
import { useActualisation, useDonnees } from '../../utils/useDonnees';
import {
  confirmerAdresse,
  detailMission,
  envoyerLienDePaiement,
  infosStatutMission,
  nombreDeColis,
  partir,
  prendreEnCharge,
  refusDePaiement,
  signalerEchec,
} from './api';
import './livraisons.css';

/**
 * Détail d'une livraison à domicile et ses étapes (CDC V3.3 §13.4).
 *
 * Le bouton du bas propose toujours l'action suivante :
 * « J'ai pris les colis » → « Adresse confirmée » → « Partir » →
 * « Remettre les colis » (écran RemisePage) ou « Signaler un problème ».
 */
export default function LivraisonPage() {
  const { id } = useParams();
  const naviguer = useNavigate();
  const confirmer = useConfirmation();
  const { afficherMessage, afficherErreur } = useMessages();
  const { rechargerProfil } = useSession();

  const mission = useDonnees(() => detailMission(id), [id]);
  // Rechargée au retour sur l'application (après l'appel au destinataire...).
  useActualisation(mission.recharger, 0);

  const [enCours, setEnCours] = useState(null); // nom de l'action en cours
  const [fenetre, setFenetre] = useState(null); // 'adresse' | 'probleme'

  /** Appelle l'API, affiche le message, puis recharge la mission et le statut du livreur. */
  async function executer(nom, appel, message) {
    setEnCours(nom);
    try {
      await appel();
      afficherMessage(message);
      mission.recharger();
      rechargerProfil();
      return true;
    } catch (erreur) {
      afficherErreur(erreur);
      return false;
    } finally {
      setEnCours(null);
    }
  }

  async function prendreLesColis(m) {
    const ok = await confirmer({
      titre: 'Colis pris en charge ?',
      texte: `Confirmez que vous avez ${m.colis.length > 1 ? `les ${m.colis.length} colis` : 'le colis'} de cette livraison, pris à ${m.station?.nom ?? 'la station'}.`,
      accepter: "J'ai les colis",
    });
    if (ok) executer('prise', () => prendreEnCharge(id), "Colis pris en charge. Appelez le destinataire avant de partir.");
  }

  async function demarrer() {
    executer('depart', () => partir(id), 'Bonne route !');
  }

  const m = mission.donnees;

  return (
    <Page
      titre={m ? `Livraison ${m.reference}` : 'Livraison'}
      largeur="moyenne"
      entete={<EnTete titre="Livraison" sousTitre={m?.reference} repli={Routes.livraisons} />}
      pied={
        m && (
          <PiedLivraison
            mission={m}
            enCours={enCours}
            onPrendre={() => prendreLesColis(m)}
            onConfirmerAdresse={() => setFenetre('adresse')}
            onPartir={demarrer}
            onRemettre={() => naviguer(Routes.remise(id))}
            onProbleme={() => setFenetre('probleme')}
            onRetour={() => naviguer(Routes.livraisons)}
          />
        )
      }
    >
      <VueDonnees etat={mission} messageChargement="Chargement de la livraison…">
        {(donnees) => (
          <ContenuLivraison
            mission={donnees}
            lienEnCours={enCours === 'lien'}
            onEnvoyerLien={() => executer('lien', () => envoyerLienDePaiement(id), 'Lien de paiement envoyé au destinataire par SMS.')}
          />
        )}
      </VueDonnees>

      {m && (
        <>
          <FenetreAdresse
            ouverte={fenetre === 'adresse'}
            mission={m}
            onFermer={() => setFenetre(null)}
            onConfirmer={async (mode) => {
              const ok = await executer('adresse', () => confirmerAdresse(id, mode), 'Adresse confirmée : vous pouvez partir.');
              if (ok) setFenetre(null);
            }}
            enCours={enCours === 'adresse'}
          />
          <FenetreProbleme
            ouverte={fenetre === 'probleme'}
            mission={m}
            onFermer={() => setFenetre(null)}
            onEnregistrer={async (motif, commentaire) => {
              const ok =
                motif === 'refus_paiement'
                  ? await executer('probleme', () => refusDePaiement(id, commentaire), 'Refus de paiement enregistré : rapportez les colis à la station.')
                  : await executer('probleme', () => signalerEchec(id, motif, commentaire), 'Livraison manquée enregistrée : rapportez les colis à la station.');
              if (ok) setFenetre(null);
            }}
            enCours={enCours === 'probleme'}
          />
        </>
      )}
    </Page>
  );
}

/** Contenu de l'écran : bilan, carte, destinataire, étapes, paiement, colis, station. */
function ContenuLivraison({ mission, lienEnCours, onEnvoyerLien }) {
  const { destinataire, station } = mission;
  const statut = infosStatutMission(mission.statut);
  const enCours = ['affectee', 'recuperee', 'adresse_confirmee', 'en_route_livraison'].includes(mission.statut);

  return (
    <div className="colonnes">
      <div className="pile" style={{ gap: 14 }}>
        {mission.statut === 'terminee' && (
          <div className="bilan bilan--succes">
            <CircleCheck size={26} aria-hidden="true" />
            <div>
              <p className="bilan__titre">Livraison terminée</p>
              <p className="bilan__texte">Les colis ont été remis à {destinataire.nom || 'leur destinataire'}. Merci !</p>
            </div>
          </div>
        )}
        {(mission.statut === 'echouee' || mission.statut === 'annulee') && (
          <div className="bilan bilan--echec">
            <Undo2 size={26} aria-hidden="true" />
            <div>
              <p className="bilan__titre">{mission.statut === 'echouee' ? 'Livraison manquée' : 'Livraison annulée'}</p>
              <p className="bilan__texte">Rapportez les colis à {station?.nom ?? 'la station'} : ils y restent à disposition.</p>
            </div>
          </div>
        )}

        {/* Destinataire : qui appeler et où aller. */}
        <Carte>
          <div className="rangee" style={{ gap: 12 }}>
            <AvatarInitiales nom={destinataire.nom} accent />
            <div className="extensible">
              <p className="etiquette-section" style={{ fontSize: 11.5 }}>
                Destinataire
              </p>
              <p className="titre" style={{ fontSize: 17 }}>
                {destinataire.nom || '—'}
              </p>
              {destinataire.telephone && <p className="texte-secondaire">+225 {afficherTelephone(destinataire.telephone)}</p>}
            </div>
            <Pastille ton={statut.ton} petite>
              {statut.libelle}
            </Pastille>
          </div>

          <div className="adresse-livraison">
            <p className="demi-gras">{destinataire.adresse || 'Adresse non précisée'}</p>
            {destinataire.repere && <p className="texte-secondaire">Repère : {destinataire.repere}</p>}
            {destinataire.lieuProche && (
              <p className="texte-secondaire">
                Près de {destinataire.lieuProche.nom}
                {destinataire.lieuProche.distanceM !== null && ` (${destinataire.lieuProche.distanceM} m)`}
              </p>
            )}
            {destinataire.instructions && <p className="adresse-livraison__instructions">« {destinataire.instructions} »</p>}
          </div>

          {enCours && (
            <div className="actions-rapides" style={{ marginTop: 14 }}>
              {destinataire.telephone && (
                <a className="action-rapide action-rapide--noire" href={`tel:${destinataire.telephone}`}>
                  <Phone size={20} aria-hidden="true" />
                  Appeler
                </a>
              )}
              {destinataire.telephone && (
                <a className="action-rapide" href={`sms:${destinataire.telephone}`}>
                  <MessageSquareText size={20} aria-hidden="true" />
                  SMS
                </a>
              )}
              {coordonnees(destinataire) && (
                <a className="action-rapide" href={lienItineraire(destinataire.latitude, destinataire.longitude)} target="_blank" rel="noreferrer">
                  <Navigation size={20} aria-hidden="true" />
                  Itinéraire
                </a>
              )}
            </div>
          )}
        </Carte>

        {enCours && (
          <BlocGris>
            <p className="etiquette-section" style={{ marginBottom: 14 }}>
              Étapes
            </p>
            <EtapesLivraison mission={mission} />
          </BlocGris>
        )}

        {mission.montantAEncaisser > 0 && enCours && (
          <div className="carte-paiement">
            <div className="rangee" style={{ gap: 12 }}>
              <span className="carte-paiement__icone">
                <Banknote size={22} aria-hidden="true" />
              </span>
              <div className="extensible">
                <p className="texte-accent-fonce" style={{ fontSize: 13 }}>
                  Paiement à la livraison
                </p>
                <p className="montant">{prix(mission.montantAEncaisser)}</p>
              </div>
            </div>
            <p className="carte-paiement__texte">
              Le destinataire paie par le lien reçu par SMS (Mobile Money) ou en espèces au moment de la remise.
            </p>
            <Bouton variante="contour" compact icone={Send} enCours={lienEnCours} onClick={onEnvoyerLien}>
              Renvoyer le lien de paiement
            </Bouton>
          </div>
        )}

        <Carte>
          <div className="titre-section" style={{ marginBottom: 2 }}>
            <h2>{nombreDeColis(mission)}</h2>
            {mission.poidsTotalKg > 0 && <span className="texte-secondaire" style={{ fontSize: 13 }}>{String(mission.poidsTotalKg).replace('.', ',')} kg</span>}
          </div>
          {mission.colis.map((colis) => (
            <div className="ligne-colis" key={colis.codeSuivi}>
              <span className="vignette">
                <Package size={20} aria-hidden="true" />
              </span>
              <div className="extensible">
                <p className="ligne-colis__code">{colis.codeSuivi}</p>
                {colis.format && <p className="ligne-colis__format">{colis.format}</p>}
              </div>
              {colis.estFragile && (
                <Pastille ton="erreur" petite icone={TriangleAlert}>
                  Fragile
                </Pastille>
              )}
            </div>
          ))}
        </Carte>
      </div>

      <div className="colonnes__droite pile" style={{ gap: 14 }}>
        <CarteLivraison mission={mission} />

        {station && (
          <Carte>
            <div className="rangee" style={{ gap: 12 }}>
              <span className="vignette">
                <Warehouse size={20} aria-hidden="true" />
              </span>
              <div className="extensible">
                <p className="etiquette-section" style={{ fontSize: 11.5 }}>
                  Station de retrait
                </p>
                <p className="gras une-ligne">{station.nom}</p>
              </div>
              {coordonnees(station) && (
                <a className="petit-bouton rangee" style={{ gap: 6, textDecoration: 'none' }} href={lienItineraire(station.latitude, station.longitude)} target="_blank" rel="noreferrer">
                  <Navigation size={15} aria-hidden="true" /> Y aller
                </a>
              )}
            </div>
            {(station.adresse || station.repere) && (
              <p className="texte-secondaire" style={{ marginTop: 10, fontSize: 13.5, lineHeight: 1.45 }}>
                {station.adresse}
                {station.repere && ` · ${station.repere}`}
              </p>
            )}
          </Carte>
        )}
      </div>
    </div>
  );
}

/** Ordre des statuts d'une livraison réussie. */
const ORDRE = ['affectee', 'recuperee', 'adresse_confirmee', 'en_route_livraison', 'terminee'];

/** Les quatre étapes de la livraison : faites en noir, en cours en orange. */
function EtapesLivraison({ mission }) {
  const rang = ORDRE.indexOf(mission.statut);
  const nom = prenom(mission.destinataire.nom) || 'le destinataire';
  const etapes = [
    { titre: 'Prendre les colis', detail: `À ${mission.station?.nom ?? 'la station'}, auprès du gestionnaire.` },
    {
      titre: "Confirmer l'adresse",
      detail: mission.adresseConfirmeeLe ? `Confirmée ${moment(mission.adresseConfirmeeLe)}.` : `Appelez ${nom} avant de partir.`,
    },
    { titre: 'Partir', detail: 'Le suivi du client passe à « En livraison ».' },
    { titre: 'Remettre les colis', detail: 'Avec le code de retrait du destinataire, ou une photo de la remise.' },
  ];

  return (
    <ol className="parcours" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {etapes.map((etape, i) => {
        const etat = i < rang ? 'faite' : i === rang ? 'courante' : 'a-venir';
        return (
          <li key={etape.titre} className={`parcours__etape parcours__etape--${etat}`}>
            <span className="parcours__rond" aria-hidden="true">
              {etat === 'faite' && <Check size={15} strokeWidth={3} />}
            </span>
            <div className="extensible">
              <p className="parcours__titre">{etape.titre}</p>
              {etat !== 'a-venir' && <p className="parcours__detail">{etape.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Carte : l'adresse de livraison, la station et la position du livreur. */
function CarteLivraison({ mission }) {
  const { position } = usePosition();
  const { destinataire, station } = mission;

  const domicile = coordonnees(destinataire);
  const depart = coordonnees(station);
  if (!domicile && !depart) return null;

  // Cadrage : avant la prise en charge, la station et le domicile ; ensuite,
  // le domicile seul. La position du livreur n'entre pas dans le cadrage :
  // la carte bougerait à chaque pas.
  const points = [domicile, mission.statut === 'affectee' ? depart : null].filter(Boolean);

  return (
    <div className="cadre-carte">
      <CarteOsm centre={domicile ?? depart} zoom={14}>
        {domicile && <Marker position={domicile} icon={iconeEpingle()} />}
        {depart && <Marker position={depart} icon={iconeStation(mission.statut === 'affectee')} />}
        {position && <Marker position={position} icon={iconeClient()} />}
        <Cadrage points={points.length > 0 ? points : [depart]} marge={40} />
      </CarteOsm>
    </div>
  );
}

/** Pied : l'action suivante de la livraison, selon son statut. */
function PiedLivraison({ mission, enCours, onPrendre, onConfirmerAdresse, onPartir, onRemettre, onProbleme, onRetour }) {
  const nom = prenom(mission.destinataire.nom);

  switch (mission.statut) {
    case 'affectee':
      return (
        <PiedDAction arrondi>
          <Bouton icone={Package} enCours={enCours === 'prise'} onClick={onPrendre}>
            J'ai pris les colis
          </Bouton>
        </PiedDAction>
      );

    case 'recuperee':
      return (
        <PiedDAction arrondi entete={<p className="pied__note extensible">Appelez {nom || 'le destinataire'} pour confirmer l'adresse avant de partir.</p>}>
          <div className="rangee" style={{ gap: 8 }}>
            {mission.destinataire.telephone && (
              <a className="bouton bouton--contour" href={`tel:${mission.destinataire.telephone}`} style={{ flex: 1 }}>
                <Phone size={20} aria-hidden="true" />
                <span>Appeler</span>
              </a>
            )}
            <Bouton style={{ flex: 1.4 }} icone={Check} onClick={onConfirmerAdresse}>
              Adresse confirmée
            </Bouton>
          </div>
        </PiedDAction>
      );

    case 'adresse_confirmee':
      return (
        <PiedDAction arrondi>
          <Bouton icone={Navigation} enCours={enCours === 'depart'} onClick={onPartir}>
            Partir en livraison
          </Bouton>
        </PiedDAction>
      );

    case 'en_route_livraison':
      return (
        <PiedDAction arrondi>
          <Bouton variante="accent" icone={CircleCheck} onClick={onRemettre}>
            Remettre les colis
          </Bouton>
          <Bouton variante="texte" icone={TriangleAlert} onClick={onProbleme}>
            Signaler un problème
          </Bouton>
        </PiedDAction>
      );

    default:
      return (
        <PiedDAction>
          <Bouton variante="secondaire" onClick={onRetour}>
            Retour aux livraisons
          </Bouton>
        </PiedDAction>
      );
  }
}

/** Fenêtre « Adresse confirmée » : par appel ou par SMS (le serveur le garde). */
function FenetreAdresse({ ouverte, mission, onFermer, onConfirmer, enCours }) {
  const [mode, setMode] = useState(null);
  const nom = prenom(mission.destinataire.nom) || 'Le destinataire';

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Adresse confirmée ?"
      pied={
        <Bouton disabled={!mode} enCours={enCours} onClick={() => onConfirmer(mode)}>
          Confirmer l'adresse
        </Bouton>
      }
    >
      <p className="modale__texte">{nom} vous a confirmé l'adresse de livraison. Comment ?</p>
      <div className="pile" style={{ gap: 8, marginTop: 16 }}>
        <Option choisie={mode === 'appel'} onClick={() => setMode('appel')}>
          <div className="rangee" style={{ gap: 12 }}>
            <span className="rond-icone">
              <Phone size={18} aria-hidden="true" />
            </span>
            <span className="demi-gras">Au téléphone</span>
          </div>
        </Option>
        <Option choisie={mode === 'sms'} onClick={() => setMode('sms')}>
          <div className="rangee" style={{ gap: 12 }}>
            <span className="rond-icone">
              <MessageSquareText size={18} aria-hidden="true" />
            </span>
            <span className="demi-gras">Par SMS</span>
          </div>
        </Option>
      </div>
    </Modale>
  );
}

/** Fenêtre « Signaler un problème » : destinataire absent, adresse incorrecte, refus de paiement. */
function FenetreProbleme({ ouverte, mission, onFermer, onEnregistrer, enCours }) {
  const [motif, setMotif] = useState(null);
  const [commentaire, setCommentaire] = useState('');

  const motifs = [
    { cle: 'destinataire_absent', libelle: 'Destinataire absent', detail: 'Injoignable ou absent à l’adresse.' },
    { cle: 'adresse_incorrecte', libelle: 'Adresse incorrecte', detail: 'Adresse introuvable ou fausse.' },
  ];
  if (mission.montantAEncaisser > 0) {
    motifs.push({ cle: 'refus_paiement', libelle: 'Refus de paiement', detail: 'Le destinataire refuse de payer : les colis retournent à l’expéditeur.' });
  }

  return (
    <Modale
      ouverte={ouverte}
      onFermer={onFermer}
      titre="Signaler un problème"
      pied={
        <Bouton variante="accent" disabled={!motif} enCours={enCours} onClick={() => onEnregistrer(motif, commentaire.trim())}>
          Enregistrer le problème
        </Bouton>
      }
    >
      {/* Focus à l'ouverture sur la liste, pas sur le champ : le clavier ne s'ouvre pas. */}
      <div className="pile" style={{ gap: 8, outline: 'none' }} tabIndex={-1} data-focus-initial>
        {motifs.map((m) => (
          <Option key={m.cle} choisie={motif === m.cle} onClick={() => setMotif(m.cle)}>
            <p className="demi-gras">{m.libelle}</p>
            <p className="texte-secondaire" style={{ fontSize: 13 }}>
              {m.detail}
            </p>
          </Option>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <Champ
          libelle="Précisions"
          facultatif
          multiligne
          bordee
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          maxLength={1000}
          placeholder="Ex. : appelé 3 fois, pas de réponse"
        />
      </div>
      <EncadreInfo icone={Undo2} className="encadre-probleme">
        La livraison sera close. Rapportez les colis à {mission.station?.nom ?? 'la station'}.
      </EncadreInfo>
    </Modale>
  );
}
