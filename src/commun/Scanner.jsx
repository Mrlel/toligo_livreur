import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { CameraOff, Flashlight } from 'lucide-react';

/**
 * Lecteur de QR code par la caméra arrière (prise des colis en station,
 * maquette LV-Liv-Scan). Le QR de l'étiquette d'un colis porte son code de
 * suivi.
 *
 * Lecture par l'API du navigateur (BarcodeDetector, Android) quand elle
 * existe, sinon par jsQR sur des images de la vidéo. `onLecture(texte)` est
 * appelé à chaque QR lu (au plus une fois par seconde pour le même texte).
 */
export default function Scanner({ onLecture, bandeau }) {
  const video = useRef(null);
  const [etat, setEtat] = useState('demarrage'); // 'demarrage' | 'actif' | 'refuse' | 'absent'
  const [lampe, setLampe] = useState(null); // piste vidéo si la lampe est pilotable
  const [lampeAllumee, setLampeAllumee] = useState(false);
  const rappel = useRef(onLecture);
  rappel.current = onLecture;

  useEffect(() => {
    let flux = null;
    let arret = false;
    let minuterie = null;
    const dernier = { texte: null, quand: 0 };
    const toile = document.createElement('canvas');
    const contexte = toile.getContext('2d', { willReadFrequently: true });
    const detecteur = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;

    function signaler(texte) {
      const maintenant = Date.now();
      if (texte === dernier.texte && maintenant - dernier.quand < 1000) return;
      dernier.texte = texte;
      dernier.quand = maintenant;
      rappel.current(texte);
    }

    async function lire() {
      if (arret) return;
      const v = video.current;
      if (v && v.readyState >= 2 && v.videoWidth > 0) {
        try {
          if (detecteur) {
            const codes = await detecteur.detect(v);
            if (codes[0]?.rawValue) signaler(codes[0].rawValue);
          } else {
            const largeur = Math.min(640, v.videoWidth);
            const hauteur = Math.round((v.videoHeight * largeur) / v.videoWidth);
            toile.width = largeur;
            toile.height = hauteur;
            contexte.drawImage(v, 0, 0, largeur, hauteur);
            const image = contexte.getImageData(0, 0, largeur, hauteur);
            const code = jsQR(image.data, largeur, hauteur, { inversionAttempts: 'dontInvert' });
            if (code?.data) signaler(code.data);
          }
        } catch {
          // Image illisible : on réessaie à la suivante.
        }
      }
      minuterie = setTimeout(lire, 250);
    }

    async function demarrer() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setEtat('absent');
        return;
      }
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (arret) {
          flux.getTracks().forEach((piste) => piste.stop());
          return;
        }
        video.current.srcObject = flux;
        await video.current.play().catch(() => {});
        setEtat('actif');
        const piste = flux.getVideoTracks()[0];
        if (piste?.getCapabilities?.().torch) setLampe(piste);
        lire();
      } catch (erreur) {
        setEtat(erreur?.name === 'NotAllowedError' ? 'refuse' : 'absent');
      }
    }

    demarrer();
    return () => {
      arret = true;
      clearTimeout(minuterie);
      flux?.getTracks().forEach((piste) => piste.stop());
    };
  }, []);

  async function basculerLampe() {
    if (!lampe) return;
    try {
      await lampe.applyConstraints({ advanced: [{ torch: !lampeAllumee }] });
      setLampeAllumee(!lampeAllumee);
    } catch {
      setLampe(null);
    }
  }

  return (
    <div className="scanner">
      <video ref={video} className="scanner__video" muted playsInline />
      {etat !== 'actif' && (
        <div className="scanner__message">
          {etat === 'demarrage' ? (
            'Ouverture de la caméra…'
          ) : (
            <>
              <CameraOff size={26} aria-hidden="true" />
              {etat === 'refuse'
                ? 'Caméra bloquée : autorisez-la pour cette application, ou saisissez les codes.'
                : 'Caméra indisponible : saisissez les codes de suivi.'}
            </>
          )}
        </div>
      )}
      {etat === 'actif' && (
        <>
          <span className="scanner__cadre" aria-hidden="true" />
          <span className="scanner__ligne" aria-hidden="true" />
        </>
      )}
      {lampe && (
        <button type="button" className="scanner__lampe" onClick={basculerLampe} aria-label={lampeAllumee ? 'Éteindre la lampe' : 'Allumer la lampe'}>
          <Flashlight size={22} />
        </button>
      )}
      {bandeau}
    </div>
  );
}
