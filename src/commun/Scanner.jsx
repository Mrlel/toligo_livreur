import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CameraOff, CircleCheck, CircleX, ScanLine } from 'lucide-react';

import { messageErreur } from '../api/client';
import { Modale, Roue } from '../composants';

/**
 * Lecture des étiquettes de colis : la caméra du téléphone lit le QR code
 * imprimé sur l'étiquette (le code de suivi « CL-261012-4F7K2Q »). Le code
 * peut aussi être tapé à la main (étiquette abîmée, pas de caméra).
 *
 * La fenêtre reste ouverte entre deux colis : le chauffeur scanne tous les
 * colis d'un box à la suite. Chaque résultat s'affiche dans la liste du bas.
 *
 * - `traiter(code)` : appelle l'API ; renvoie le message de réussite, ou lève
 *   une erreur (affichée en rouge) ;
 * - `titre`, `aide` : ce que le chauffeur est en train de faire.
 *
 * Détection : `BarcodeDetector` du navigateur quand il existe (Chrome sur
 * Android), sinon la bibliothèque jsQR (Safari sur iPhone), chargée à la
 * demande.
 */
export function Scanner({ ouverte, onFermer, titre, aide, traiter }) {
  const video = useRef(null);
  const [camera, setCamera] = useState('demarrage'); // 'demarrage' | 'active' | 'refusee' | 'indisponible'
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [resultats, setResultats] = useState([]);

  // Un code à la fois, et le même code n'est pas renvoyé tant qu'il reste
  // devant la caméra.
  const occupe = useRef(false);
  const dernier = useRef({ code: null, moment: 0 });

  async function soumettre(texte) {
    const code = codeSuivi(texte);
    if (!code || occupe.current) return;
    if (dernier.current.code === code && Date.now() - dernier.current.moment < 4000) return;
    dernier.current = { code, moment: Date.now() };

    occupe.current = true;
    setEnCours(true);
    try {
      const message = await traiter(code);
      navigator.vibrate?.(80);
      ajouterResultat({ code, reussi: true, message });
      setSaisie('');
    } catch (erreur) {
      navigator.vibrate?.([60, 60, 60]);
      ajouterResultat({ code, reussi: false, message: messageErreur(erreur) });
    } finally {
      occupe.current = false;
      setEnCours(false);
    }
  }

  function ajouterResultat(resultat) {
    setResultats((liste) => [{ ...resultat, id: `${resultat.code}-${Date.now()}` }, ...liste].slice(0, 6));
  }

  // La boucle de lecture appelle toujours la version à jour de soumettre().
  const soumettreActuel = useRef(soumettre);
  soumettreActuel.current = soumettre;

  // Caméra allumée seulement pendant que la fenêtre est ouverte.
  useEffect(() => {
    if (!ouverte) return undefined;

    let arrete = false;
    let flux = null;
    let minuteur = null;
    setResultats([]);
    setSaisie('');
    dernier.current = { code: null, moment: 0 };

    async function demarrer() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera('indisponible');
        return;
      }
      setCamera('demarrage');
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (erreur) {
        setCamera(erreur?.name === 'NotAllowedError' ? 'refusee' : 'indisponible');
        return;
      }
      if (arrete || !video.current) {
        flux.getTracks().forEach((piste) => piste.stop());
        return;
      }

      video.current.srcObject = flux;
      await video.current.play().catch(() => {});
      setCamera('active');

      const lire = await creerLecteur();
      const boucle = async () => {
        if (arrete) return;
        if (!occupe.current && video.current) {
          const texte = await lire(video.current).catch(() => null);
          if (texte && !arrete) soumettreActuel.current(texte);
        }
        minuteur = setTimeout(boucle, 250);
      };
      boucle();
    }

    demarrer();

    return () => {
      arrete = true;
      clearTimeout(minuteur);
      flux?.getTracks().forEach((piste) => piste.stop());
    };
  }, [ouverte]);

  const nbReussis = resultats.filter((r) => r.reussi).length;

  return (
    <Modale ouverte={ouverte} onFermer={onFermer} titre={titre} haute>
      {aide && <p className="modale__texte" style={{ fontSize: 14 }}>{aide}</p>}

      {/* Reçoit le focus à l'ouverture à la place du champ de saisie : sur
          téléphone, le clavier cacherait la caméra. */}
      <div className="scanner__cadre" tabIndex={-1} data-focus-initial>
        <video ref={video} className="scanner__video" playsInline muted autoPlay />
        {camera === 'active' && (
          <div className="scanner__viseur" aria-hidden="true">
            <span />
          </div>
        )}
        {camera === 'demarrage' && (
          <div className="scanner__etat">
            <Roue />
            <p>Ouverture de la caméra…</p>
          </div>
        )}
        {(camera === 'refusee' || camera === 'indisponible') && (
          <div className="scanner__etat">
            <CameraOff size={30} aria-hidden="true" />
            <p>
              {camera === 'refusee'
                ? 'Caméra bloquée : autorisez-la dans le navigateur, ou tapez le code ci-dessous.'
                : 'Caméra indisponible : tapez le code de l’étiquette ci-dessous.'}
            </p>
          </div>
        )}
        {enCours && (
          <div className="scanner__envoi">
            <Roue taille="petite" /> Envoi…
          </div>
        )}
      </div>

      <form
        className="scanner__saisie"
        onSubmit={(evenement) => {
          evenement.preventDefault();
          dernier.current = { code: null, moment: 0 }; // une saisie à la main est toujours envoyée
          soumettre(saisie);
        }}
      >
        <ScanLine size={20} aria-hidden="true" />
        <label htmlFor="scanner-code" className="invisible">
          Code de suivi
        </label>
        <input
          id="scanner-code"
          type="text"
          placeholder="Ou tapez le code : CL-261012-4F7K2Q"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value.toUpperCase())}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button type="submit" aria-label="Envoyer le code" disabled={!saisie.trim() || enCours}>
          <ArrowRight size={20} />
        </button>
      </form>

      {resultats.length > 0 && (
        <div className="scanner__resultats" aria-live="polite">
          <p className="etiquette-section">
            {nbReussis} colis enregistré{nbReussis > 1 ? 's' : ''}
          </p>
          <AnimatePresence initial={false}>
            {resultats.map((resultat) => (
              <motion.div
                key={resultat.id}
                className={`scanner__resultat${resultat.reussi ? '' : ' scanner__resultat--echec'}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {resultat.reussi ? <CircleCheck size={20} aria-hidden="true" /> : <CircleX size={20} aria-hidden="true" />}
                <div className="extensible">
                  <p className="gras">{resultat.code}</p>
                  <p className="scanner__message">{resultat.message}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </Modale>
  );
}

/**
 * Code de suivi lu dans le QR code ou tapé : le QR peut contenir le code seul
 * ou une adresse qui le contient (lien de suivi).
 */
function codeSuivi(texte) {
  const brut = String(texte ?? '').trim();
  if (!brut) return '';
  const trouve = brut.match(/CL-\d{6}-[A-Z0-9]{6}/i);
  return (trouve ? trouve[0] : brut).toUpperCase();
}

/** Renvoie une fonction `lire(video)` qui donne le texte du QR code visible, ou null. */
async function creerLecteur() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const detecteur = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (source) => (await detecteur.detect(source))[0]?.rawValue ?? null;
      }
    } catch {
      // Détecteur inutilisable : on passe à jsQR.
    }
  }

  const { default: jsQR } = await import('jsqr');
  const canevas = document.createElement('canvas');
  const contexte = canevas.getContext('2d', { willReadFrequently: true });

  return async (source) => {
    if (!source.videoWidth) return null;
    // Image réduite : la lecture reste rapide sur un téléphone modeste.
    const echelle = Math.min(1, 640 / Math.max(source.videoWidth, source.videoHeight));
    canevas.width = Math.round(source.videoWidth * echelle);
    canevas.height = Math.round(source.videoHeight * echelle);
    contexte.drawImage(source, 0, 0, canevas.width, canevas.height);
    const image = contexte.getImageData(0, 0, canevas.width, canevas.height);
    return jsQR(image.data, canevas.width, canevas.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
  };
}
