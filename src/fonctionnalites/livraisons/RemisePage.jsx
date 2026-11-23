import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Banknote, Camera, KeyRound, RotateCcw, Smartphone } from 'lucide-react';

import {
  Bouton,
  Champ,
  EncadreInfo,
  EnTete,
  OngletsSegmentes,
  Option,
  Page,
  PiedDAction,
  VueDonnees,
  VueVide,
  useConfirmation,
  useMessages,
} from '../../composants';
import { usePosition } from '../../commun/Position';
import { Routes } from '../../commun/routes';
import { useSession } from '../../session/Session';
import { prenom, prix } from '../../utils/formatage';
import { preparerPhoto } from '../../utils/photo';
import { useDonnees } from '../../utils/useDonnees';
import { detailMission, envoyerLienDePaiement, nombreDeColis, remettre } from './api';
import './livraisons.css';

/**
 * Remise des colis au destinataire (BF-LIV-09) : la preuve est le code de
 * retrait que le destinataire a reçu par SMS, ou à défaut une photo de la
 * remise. En paiement à la livraison, le livreur indique comment le
 * destinataire a payé (lien Mobile Money ou espèces).
 *
 * La position du livreur est jointe à la remise quand elle est connue.
 */
export default function RemisePage() {
  const { id } = useParams();
  const mission = useDonnees(() => detailMission(id), [id]);

  return (
    <VueDonnees etat={mission} messageChargement="Chargement de la livraison…">
      {(m) => <FormulaireRemise mission={m} />}
    </VueDonnees>
  );
}

function FormulaireRemise({ mission }) {
  const naviguer = useNavigate();
  const confirmer = useConfirmation();
  const { afficherMessage, afficherErreur } = useMessages();
  const { rechargerProfil } = useSession();
  const { position } = usePosition();

  const [preuve, setPreuve] = useState('code'); // 'code' | 'photo'
  const [codes, setCodes] = useState({}); // { [codeSuivi]: '482719' }, un code par colis
  const [photo, setPhoto] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [paiement, setPaiement] = useState(null); // 'lien' | 'especes'
  const [erreurs, setErreurs] = useState({});
  const [enCours, setEnCours] = useState(false);
  const [lienEnCours, setLienEnCours] = useState(false);
  const champPhoto = useRef(null);

  // L'aperçu de la photo est libéré quand il est remplacé ou à la sortie.
  useEffect(() => () => apercu && URL.revokeObjectURL(apercu), [apercu]);

  const nom = prenom(mission.destinataire.nom) || 'le destinataire';
  const aEncaisser = mission.montantAEncaisser > 0;
  // Le destinataire a reçu un SMS par colis, chacun avec son propre code.
  const plusieursColis = mission.colis.length > 1;

  if (mission.statut !== 'en_route_livraison') {
    return (
      <Page titre="Remise" entete={<EnTete titre="Remise des colis" repli={Routes.livraison(mission.id)} />}>
        <VueVide
          titre="Remise impossible pour le moment"
          message="La remise se fait une fois parti en livraison, l'adresse confirmée avec le destinataire."
          action={
            <Bouton variante="secondaire" compact onClick={() => naviguer(Routes.livraison(mission.id), { replace: true })}>
              Retour à la livraison
            </Bouton>
          }
        />
      </Page>
    );
  }

  async function choisirPhoto(evenement) {
    const fichier = evenement.target.files?.[0];
    evenement.target.value = '';
    if (!fichier) return;
    try {
      const prete = await preparerPhoto(fichier);
      setPhoto(prete);
      setApercu(URL.createObjectURL(prete));
      setErreurs((ancien) => ({ ...ancien, photo: null }));
    } catch (erreur) {
      afficherErreur(erreur);
    }
  }

  async function renvoyerLien() {
    setLienEnCours(true);
    try {
      await envoyerLienDePaiement(mission.id);
      afficherMessage('Lien de paiement envoyé au destinataire par SMS.');
    } catch (erreur) {
      afficherErreur(erreur);
    } finally {
      setLienEnCours(false);
    }
  }

  async function valider() {
    const sansCode = preuve === 'code' ? mission.colis.filter((colis) => !/^\d{4,}$/.test(codes[colis.codeSuivi] ?? '')) : [];
    const nouvellesErreurs = {
      paiement: aEncaisser && !paiement ? 'Indiquez comment le destinataire a payé.' : null,
      codes: Object.fromEntries(
        sansCode.map((colis) => [colis.codeSuivi, plusieursColis ? 'Saisissez le code de ce colis (6 chiffres).' : 'Saisissez le code de retrait (6 chiffres).']),
      ),
      photo: preuve === 'photo' && !photo ? 'Prenez une photo de la remise.' : null,
    };
    setErreurs(nouvellesErreurs);
    if (nouvellesErreurs.paiement || sansCode.length > 0 || nouvellesErreurs.photo) return;

    if (paiement === 'especes') {
      const ok = await confirmer({
        titre: `${prix(mission.montantAEncaisser)} reçus ?`,
        texte: `Confirmez que ${nom} vous a payé ${prix(mission.montantAEncaisser)} en espèces. Vous les reverserez à votre station.`,
        accepter: "J'ai reçu l'argent",
      });
      if (!ok) return;
    }

    setEnCours(true);
    try {
      await remettre(mission.id, {
        codes: preuve === 'code' ? codes : null,
        photo: preuve === 'photo' ? photo : null,
        modePaiement: paiement === 'especes' ? 'especes' : null,
        position,
      });
      afficherMessage('Livraison enregistrée. Merci !');
      rechargerProfil();
      naviguer(Routes.livraison(mission.id), { replace: true });
    } catch (erreur) {
      setEnCours(false);
      afficherErreur(erreur);
    }
  }

  return (
    <Page
      titre="Remise"
      entete={<EnTete titre="Remise des colis" sousTitre={`${nombreDeColis(mission)} pour ${mission.destinataire.nom}`} repli={Routes.livraison(mission.id)} />}
      pied={
        <PiedDAction arrondi>
          <Bouton variante="accent" enCours={enCours} onClick={valider}>
            Valider la remise
          </Bouton>
        </PiedDAction>
      }
    >
      <div className="pile" style={{ gap: 22 }}>
        {aEncaisser && (
          <section>
            <p className="etiquette-section">Paiement · {prix(mission.montantAEncaisser)}</p>
            <div className="pile" style={{ gap: 8, marginTop: 10 }}>
              <Option
                choisie={paiement === 'lien'}
                onClick={() => {
                  setPaiement('lien');
                  setErreurs((ancien) => ({ ...ancien, paiement: null }));
                }}
              >
                <div className="rangee" style={{ gap: 12 }}>
                  <span className={`rond-icone${paiement === 'lien' ? ' rond-icone--noir' : ''}`}>
                    <Smartphone size={18} aria-hidden="true" />
                  </span>
                  <div className="extensible">
                    <p className="demi-gras">Payé par le lien (Mobile Money)</p>
                    <p className="texte-secondaire" style={{ fontSize: 13 }}>
                      Le paiement doit être validé avant la remise.
                    </p>
                  </div>
                </div>
              </Option>
              <Option
                choisie={paiement === 'especes'}
                onClick={() => {
                  setPaiement('especes');
                  setErreurs((ancien) => ({ ...ancien, paiement: null }));
                }}
              >
                <div className="rangee" style={{ gap: 12 }}>
                  <span className={`rond-icone${paiement === 'especes' ? ' rond-icone--noir' : ''}`}>
                    <Banknote size={18} aria-hidden="true" />
                  </span>
                  <div className="extensible">
                    <p className="demi-gras">Payé en espèces</p>
                    <p className="texte-secondaire" style={{ fontSize: 13 }}>
                      Vous encaissez {prix(mission.montantAEncaisser)}.
                    </p>
                  </div>
                </div>
              </Option>
            </div>
            {erreurs.paiement && <p className="champ__erreur">{erreurs.paiement}</p>}
            {paiement === 'lien' && (
              <div style={{ marginTop: 10 }}>
                <Bouton variante="texte" compact enCours={lienEnCours} onClick={renvoyerLien}>
                  Le destinataire n'a pas reçu le lien ? Le renvoyer
                </Bouton>
              </div>
            )}
          </section>
        )}

        <section>
          <p className="etiquette-section" style={{ marginBottom: 10 }}>
            Preuve de remise
          </p>
          <OngletsSegmentes
            onglets={[
              { cle: 'code', libelle: 'Code de retrait' },
              { cle: 'photo', libelle: 'Photo' },
            ]}
            courant={preuve}
            onChoisir={setPreuve}
          />

          {preuve === 'code' ? (
            <div className="pile" style={{ gap: 14, marginTop: 16 }}>
              {plusieursColis && (
                <p className="texte-secondaire" style={{ fontSize: 13 }}>
                  {nom} a reçu un SMS par colis, chacun avec son code à 6 chiffres. Le numéro du colis figure dans le SMS.
                </p>
              )}
              {mission.colis.map((colis) => (
                <Champ
                  key={colis.codeSuivi}
                  libelle={plusieursColis ? `Colis ${colis.codeSuivi}` : `Code reçu par ${nom}`}
                  aide={plusieursColis ? null : 'Le destinataire a reçu ce code à 6 chiffres par SMS. Demandez-le au moment de la remise.'}
                  erreur={erreurs.codes?.[colis.codeSuivi]}
                  classeSaisie="saisie-code"
                  inputMode="numeric"
                  autoComplete={plusieursColis ? 'off' : 'one-time-code'}
                  placeholder="000000"
                  maxLength={8}
                  value={codes[colis.codeSuivi] ?? ''}
                  onChange={(e) => {
                    const saisi = e.target.value.replace(/\D/g, '');
                    setCodes((ancien) => ({ ...ancien, [colis.codeSuivi]: saisi }));
                    setErreurs((ancien) => ({ ...ancien, codes: { ...ancien.codes, [colis.codeSuivi]: null } }));
                  }}
                />
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <input ref={champPhoto} type="file" accept="image/*" capture="environment" hidden onChange={choisirPhoto} />
              {apercu ? (
                <div className="apercu-photo">
                  <img src={apercu} alt="Photo de la remise" />
                  <button type="button" className="petit-bouton apercu-photo__reprendre" onClick={() => champPhoto.current?.click()}>
                    <RotateCcw size={15} aria-hidden="true" /> Reprendre
                  </button>
                </div>
              ) : (
                <button type="button" className={`prise-photo${erreurs.photo ? ' prise-photo--erreur' : ''}`} onClick={() => champPhoto.current?.click()}>
                  <span className="rond-icone rond-icone--noir">
                    <Camera size={20} aria-hidden="true" />
                  </span>
                  <span className="demi-gras">Prendre la photo</span>
                  <span className="texte-secondaire" style={{ fontSize: 13 }}>
                    Les colis remis, avec la porte ou le destinataire.
                  </span>
                </button>
              )}
              {erreurs.photo && <p className="champ__erreur">{erreurs.photo}</p>}
            </div>
          )}
        </section>

        <EncadreInfo icone={KeyRound}>
          Sans code, une photo suffit : par exemple quand le destinataire a perdu son SMS.
        </EncadreInfo>
      </div>
    </Page>
  );
}
