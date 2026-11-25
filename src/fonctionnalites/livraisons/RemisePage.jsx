import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Banknote, Camera, Check, RotateCcw, Smartphone } from 'lucide-react';

import { Bouton, Cascade, EnTete, Illustration, Option, Page, Pastille, PiedDAction, VueDonnees, useConfirmation, useMessages } from '../../composants';
import { usePosition } from '../../commun/Position';
import { Routes } from '../../commun/routes';
import { useSession } from '../../session/Session';
import { prenom, prix } from '../../utils/formatage';
import { preparerPhoto } from '../../utils/photo';
import { useDonnees } from '../../utils/useDonnees';
import { detailMission, envoyerLienDePaiement, illustrationColis, listerMissions, remettre, verifierCode } from './api';
import { BlocEspeces } from './LivraisonsPage';
import { EtapesLivraison } from './LivraisonPage';
import './livraisons.css';

/** Longueur d'un code de retrait (un SMS par colis). */
const LONGUEUR_CODE = 6;

/**
 * 4. Remettre les colis (maquettes LV-Liv-Remise et LV-Liv-Encaissement).
 *
 * Preuve : le code de retrait de chaque colis, vérifié dès qu'il est saisi
 * (badge « Code valide »), ou une photo de la remise pour tous les colis.
 * En paiement à la livraison, l'écran suivant encaisse (espèces ou Mobile
 * Money) puis valide la remise. La position du livreur est jointe.
 */
export default function RemisePage() {
  const { id } = useParams();
  const mission = useDonnees(() => detailMission(id), [id]);

  return (
    <VueDonnees etat={mission} messageChargement="Chargement de la livraison…">
      {(m) => (m.statut === 'en_route_livraison' ? <Remise mission={m} /> : <Navigate to={Routes.livraison(m.id)} replace />)}
    </VueDonnees>
  );
}

function Remise({ mission }) {
  const naviguer = useNavigate();
  const confirmer = useConfirmation();
  const { afficherMessage, afficherErreur } = useMessages();
  const { rechargerProfil } = useSession();
  const { position } = usePosition();

  const [etape, setEtape] = useState('codes'); // 'codes' | 'paiement'
  const [codes, setCodes] = useState({}); // { [codeSuivi]: '571304' }
  const [validite, setValidite] = useState({}); // { [codeSuivi]: 'verification' | 'valide' | 'faux' }
  const [photo, setPhoto] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [paiement, setPaiement] = useState('especes'); // 'especes' | 'mobile_money'
  const [enCours, setEnCours] = useState(false);
  const champPhoto = useRef(null);

  // Espèces déjà détenues et plafond, pour la jauge de l'encaissement.
  const especes = useDonnees(listerMissions, []);

  useEffect(() => () => apercu && URL.revokeObjectURL(apercu), [apercu]);

  const nom = prenom(mission.destinataire.nom) || 'le destinataire';
  const aEncaisser = mission.montantAEncaisser > 0;
  const preuveCode = mission.colis.every((colis) => validite[colis.codeSuivi] === 'valide');
  const preuvePrete = preuveCode || Boolean(photo);

  // Vérification une fois la saisie arrêtée (0,6 s) : la route n'accepte que
  // 10 essais par minute, un code retapé chiffre par chiffre n'en use qu'un.
  const attentes = useRef({});
  useEffect(() => () => Object.values(attentes.current).forEach(clearTimeout), []);

  function saisirCode(codeSuivi, valeur) {
    setCodes((anciens) => ({ ...anciens, [codeSuivi]: valeur }));
    clearTimeout(attentes.current[codeSuivi]);
    if (valeur.length < LONGUEUR_CODE) {
      setValidite((anciens) => ({ ...anciens, [codeSuivi]: undefined }));
      return;
    }
    setValidite((anciens) => ({ ...anciens, [codeSuivi]: 'verification' }));
    attentes.current[codeSuivi] = setTimeout(async () => {
      try {
        const bon = await verifierCode(mission.id, codeSuivi, valeur);
        setValidite((anciens) => ({ ...anciens, [codeSuivi]: bon ? 'valide' : 'faux' }));
      } catch (erreur) {
        setValidite((anciens) => ({ ...anciens, [codeSuivi]: undefined }));
        afficherErreur(erreur);
      }
    }, 600);
  }

  async function choisirPhoto(evenement) {
    const fichier = evenement.target.files?.[0];
    evenement.target.value = '';
    if (!fichier) return;
    try {
      const prete = await preparerPhoto(fichier);
      setPhoto(prete);
      setApercu(URL.createObjectURL(prete));
    } catch (erreur) {
      afficherErreur(erreur);
    }
  }

  async function valider() {
    if (aEncaisser && paiement === 'especes') {
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
        codes: photo ? null : codes,
        photo,
        modePaiement: aEncaisser && paiement === 'especes' ? 'especes' : null,
        position,
      });
      rechargerProfil();
      naviguer(Routes.finLivraison(mission.id), { replace: true, state: { preuve: photo ? 'photo' : 'code' } });
    } catch (erreur) {
      afficherErreur(erreur);
      setEnCours(false);
    }
  }

  async function renvoyerLien() {
    try {
      await envoyerLienDePaiement(mission.id);
      afficherMessage('Lien de paiement renvoyé au destinataire par SMS.');
    } catch (erreur) {
      afficherErreur(erreur);
    }
  }

  // -------------------------------------------------------------------------
  // Encaissement
  // -------------------------------------------------------------------------
  if (etape === 'paiement') {
    const detenues = especes.donnees?.especesDetenues ?? 0;
    return (
      <Page
        titre="Encaissement"
        entete={<EnTete titre="Encaissement" sousTitre="Paiement à la livraison" gris onRetour={() => setEtape('codes')} />}
        pied={
          <PiedDAction arrondi>
            <Bouton variante="accent" icone={Check} enCours={enCours} onClick={valider}>
              Valider la remise
            </Bouton>
            <button type="button" className="lien-rouge" onClick={() => naviguer(Routes.echec(mission.id), { state: { motif: 'refus_paiement' } })}>
              Le destinataire refuse de payer
            </button>
          </PiedDAction>
        }
      >
        <EtapesLivraison courante={4} />
        <div className="pile" style={{ gap: 14 }}>
          <div className="montant-a-encaisser">
            <span className="montant-a-encaisser__libelle">À encaisser auprès de {nom}</span>
            <span className="montant-a-encaisser__montant">{prix(mission.montantAEncaisser)}</span>
            <span className="montant-a-encaisser__detail">{mission.colis.length} colis · livraison à domicile</span>
          </div>

          <section>
            <div className="titre-bloc">
              <span className="etiquette-section">Mode de paiement</span>
            </div>
            <div className="pile" style={{ gap: 10 }}>
              <Option choisie={paiement === 'especes'} onClick={() => setPaiement('especes')}>
                <span className={`icone-option${paiement === 'especes' ? ' icone-option--choisie' : ''}`}>
                  <Banknote size={22} aria-hidden="true" />
                </span>
                <span className="extensible">
                  <span className="option__titre">Espèces</span>
                  <span className="option__texte">Vous recevez {prix(mission.montantAEncaisser)} en main propre</span>
                </span>
              </Option>
              <Option choisie={paiement === 'mobile_money'} onClick={() => setPaiement('mobile_money')}>
                <span className={`icone-option${paiement === 'mobile_money' ? ' icone-option--choisie' : ''}`}>
                  <Smartphone size={22} aria-hidden="true" />
                </span>
                <span className="extensible">
                  <span className="option__titre">Mobile Money</span>
                  <span className="option__texte">Le destinataire paie par le lien reçu par SMS</span>
                </span>
              </Option>
              {paiement === 'mobile_money' && (
                <button type="button" className="petit-bouton rangee" style={{ gap: 8, alignSelf: 'flex-start', marginLeft: 70 }} onClick={renvoyerLien}>
                  <RotateCcw size={16} aria-hidden="true" /> Renvoyer le lien
                </button>
              )}
            </div>
          </section>

          {paiement === 'especes' && (
            <BlocEspeces montant={detenues + mission.montantAEncaisser} plafond={especes.donnees?.plafondEspeces} note="À reverser ensuite à votre station." />
          )}
        </div>
      </Page>
    );
  }

  // -------------------------------------------------------------------------
  // Codes de retrait (ou photo)
  // -------------------------------------------------------------------------
  return (
    <Page
      titre="Remettre les colis"
      entete={
        <EnTete
          titre="Remettre les colis"
          sousTitre={`${mission.destinataire.nom} · ${mission.colis.length} colis`}
          gris
          repli={Routes.livraison(mission.id)}
        />
      }
      pied={
        <PiedDAction arrondi>
          {aEncaisser ? (
            <Bouton disabled={!preuvePrete} onClick={() => setEtape('paiement')}>
              Continuer vers le paiement
            </Bouton>
          ) : (
            <Bouton variante="accent" icone={Check} enCours={enCours} disabled={!preuvePrete} onClick={valider}>
              Valider la remise
            </Bouton>
          )}
          <button type="button" className="lien-rouge" onClick={() => naviguer(Routes.echec(mission.id))}>
            Livraison impossible
          </button>
        </PiedDAction>
      }
    >
      <EtapesLivraison courante={4} />

      {!photo && (
        <>
          <div className="titre-bloc">
            <span className="etiquette-section">Codes de retrait</span>
            <span className="titre-bloc__precision">un code par colis</span>
          </div>
          <Cascade className="liste-carte">
            {mission.colis.map((colis) => (
              <div key={colis.codeSuivi} className="code-colis">
                <div className="rangee" style={{ gap: 12 }}>
                  <span className="vignette-colis" style={{ width: 42, height: 42, borderRadius: 12 }}>
                    <Illustration nom={illustrationColis(colis.format)} taille={30} carre={false} />
                  </span>
                  <span className="extensible">
                    <span className="gras" style={{ display: 'block', letterSpacing: 0.2 }}>
                      {colis.codeSuivi}
                    </span>
                    <span className="texte-secondaire" style={{ display: 'block', fontSize: 13.5 }}>
                      {colis.format ?? 'Colis'}
                    </span>
                  </span>
                  <BadgeCode etat={validite[colis.codeSuivi]} />
                </div>
                <CasesCode valeur={codes[colis.codeSuivi] ?? ''} faux={validite[colis.codeSuivi] === 'faux'} onChange={(valeur) => saisirCode(colis.codeSuivi, valeur)} />
              </div>
            ))}
          </Cascade>
          <p className="texte-secondaire" style={{ fontSize: 13.5, margin: '10px 4px 14px' }}>
            Le destinataire a reçu un code par SMS pour chaque colis, à leur arrivée en station.
          </p>
        </>
      )}

      {photo ? (
        <div className="apercu-remise">
          <img src={apercu} alt="Photo de la remise" />
          <div className="rangee" style={{ gap: 10, marginTop: 10 }}>
            <Pastille ton="succes">Photo de la remise prise</Pastille>
            <button type="button" className="lien" onClick={() => champPhoto.current?.click()}>
              Reprendre
            </button>
            <button type="button" className="lien" onClick={() => setPhoto(null)}>
              Utiliser les codes
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="sans-code" onClick={() => champPhoto.current?.click()}>
          <span className="sans-code__icone" aria-hidden="true">
            <Camera size={22} />
          </span>
          <span>
            <span className="gras" style={{ display: 'block', fontSize: 15.5 }}>
              Pas de code ?
            </span>
            <span className="texte-secondaire" style={{ display: 'block', fontSize: 14 }}>
              Prenez une photo de la remise, valable pour tous les colis
            </span>
          </span>
        </button>
      )}
      <input ref={champPhoto} type="file" accept="image/*" capture="environment" hidden onChange={choisirPhoto} />
    </Page>
  );
}

/** « Code valide » (vert), « Code incorrect » (rouge), vérification en cours. */
function BadgeCode({ etat }) {
  if (etat === 'valide') return <Pastille ton="succes">Code valide</Pastille>;
  if (etat === 'faux') return <Pastille ton="erreur">Code incorrect</Pastille>;
  if (etat === 'verification') return <Pastille>Vérification…</Pastille>;
  return null;
}

/** Six cases d'un code de retrait : on passe seul à la case suivante. */
function CasesCode({ valeur, faux, onChange }) {
  const cases = useRef([]);

  function changer(index, texte) {
    let chiffres = texte.replace(/\D/g, '');
    // Case déjà remplie : seul le chiffre tapé compte.
    if (chiffres.length === 2 && valeur[index]) chiffres = chiffres.replace(valeur[index], '') || valeur[index];
    if (chiffres.length > 1) {
      // Code collé d'un coup.
      const complet = (valeur.slice(0, index) + chiffres).slice(0, LONGUEUR_CODE);
      onChange(complet);
      cases.current[Math.min(complet.length, LONGUEUR_CODE - 1)]?.focus();
      return;
    }
    const tableau = valeur.padEnd(LONGUEUR_CODE, ' ').split('');
    tableau[index] = chiffres || ' ';
    const nouveau = tableau.join('').replace(/\s+$/, '').replace(/\s/g, '');
    onChange(nouveau);
    if (chiffres && index < LONGUEUR_CODE - 1) cases.current[index + 1]?.focus();
  }

  return (
    <div className={`cases-code${faux ? ' cases-code--fausse' : ''}`}>
      {Array.from({ length: LONGUEUR_CODE }, (_, i) => (
        <input
          key={i}
          ref={(element) => {
            cases.current[i] = element;
          }}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={`Chiffre ${i + 1}`}
          value={valeur[i] ?? ''}
          maxLength={LONGUEUR_CODE}
          onChange={(e) => changer(i, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !valeur[i] && i > 0) cases.current[i - 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}
