import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Check, Keyboard } from 'lucide-react';

import { Bouton, Champ, Cascade, EnTete, Modale, Page, PiedDAction, VueDonnees, useMessages } from '../../composants';
import Scanner from '../../commun/Scanner';
import { Routes } from '../../commun/routes';
import { useSession } from '../../session/Session';
import { useDonnees } from '../../utils/useDonnees';
import { detailMission, prendreEnCharge } from './api';
import { EtapesLivraison, LigneColis } from './LivraisonPage';
import './livraisons.css';

/**
 * Prise des colis en station (maquette LV-Liv-Scan) : le livreur scanne le
 * QR code de chaque colis de la mission, ou saisit son code de suivi si la
 * caméra ne marche pas. La prise en charge n'est possible qu'une fois tous
 * les colis vérifiés (décision du 25/11/2026 ; contrôle fait dans l'app).
 */
export default function PrisePage() {
  const { id } = useParams();
  const mission = useDonnees(() => detailMission(id), [id]);

  return (
    <VueDonnees etat={mission} messageChargement="Chargement de la mission…">
      {(m) => (m.statut === 'affectee' ? <ScanDesColis mission={m} /> : <Navigate to={Routes.livraison(m.id)} replace />)}
    </VueDonnees>
  );
}

/** Code de suivi lu dans le QR (texte seul, ou adresse qui le contient). */
function codeDansLeTexte(texte) {
  const trouve = texte.toUpperCase().match(/CL-[A-Z0-9]+-[A-Z0-9]+/);
  return trouve ? trouve[0] : texte.trim().toUpperCase();
}

function ScanDesColis({ mission }) {
  const naviguer = useNavigate();
  const { afficherMessage, afficherErreur } = useMessages();
  const { rechargerProfil } = useSession();
  const [verifies, setVerifies] = useState([]);
  const [dernier, setDernier] = useState(null); // { code, connu }
  const [saisie, setSaisie] = useState(null); // texte de la saisie manuelle, null = fenêtre fermée
  const [enCours, setEnCours] = useState(false);

  const total = mission.colis.length;
  const tousVerifies = verifies.length === total;

  function verifier(texte) {
    const code = codeDansLeTexte(texte);
    const connu = mission.colis.some((colis) => colis.codeSuivi === code);
    setDernier({ code, connu });
    if (connu) {
      setVerifies((anciens) => (anciens.includes(code) ? anciens : [...anciens, code]));
      navigator.vibrate?.(60);
    }
    return connu;
  }

  async function confirmer() {
    setEnCours(true);
    try {
      await prendreEnCharge(mission.id);
      afficherMessage('Colis pris en charge. Confirmez maintenant l’adresse avec le destinataire.');
      rechargerProfil();
      naviguer(Routes.livraison(mission.id), { replace: true });
    } catch (erreur) {
      afficherErreur(erreur);
      setEnCours(false);
    }
  }

  return (
    <Page
      titre="Prendre les colis"
      entete={<EnTete titre="Prendre les colis" sousTitre={mission.station?.nom ?? 'Station'} gris repli={Routes.livraison(mission.id)} />}
      pied={
        <PiedDAction arrondi>
          <Bouton icone={Check} enCours={enCours} disabled={!tousVerifies} onClick={confirmer}>
            {tousVerifies ? 'Confirmer la prise en charge' : `Scannez les ${total - verifies.length} colis restants`}
          </Bouton>
        </PiedDAction>
      }
    >
      <EtapesLivraison courante={1} />

      <Scanner
        onLecture={verifier}
        bandeau={
          dernier && (
            <span className={`scanner__bandeau${dernier.connu ? '' : ' scanner__bandeau--inconnu'}`}>
              <span className="scanner__bandeau-rond" aria-hidden="true">
                <Check size={16} strokeWidth={3} />
              </span>
              {dernier.connu ? `${dernier.code} scanné` : `${dernier.code} : pas dans cette mission`}
            </span>
          )
        }
      />

      <div className="titre-bloc" style={{ marginTop: 18 }}>
        <span className="etiquette-section">Colis vérifiés</span>
        <span className="gras" style={{ fontSize: 15 }}>
          {verifies.length} sur {total}
        </span>
      </div>
      <span className="jauge jauge--verte" style={{ marginBottom: 14 }}>
        <span className="jauge__barre" style={{ width: `${(verifies.length / total) * 100}%` }} />
      </span>

      <Cascade className="liste-carte">
        {mission.colis.map((colis) => (
          <LigneColis
            key={colis.codeSuivi}
            colis={colis}
            detail={`${colis.format ?? 'Colis'} · ${mission.destinataire.nom}`}
            fin={
              verifies.includes(colis.codeSuivi) ? (
                <span className="coche-verte" aria-label="Vérifié">
                  <Check size={18} strokeWidth={3} />
                </span>
              ) : (
                <span className="coche-vide" aria-label="À scanner" />
              )
            }
          />
        ))}
      </Cascade>

      <button type="button" className="lien-discret" onClick={() => setSaisie('')} style={{ marginTop: 12 }}>
        <Keyboard size={18} aria-hidden="true" /> Saisir un code de suivi
      </button>

      <Modale
        ouverte={saisie !== null}
        onFermer={() => setSaisie(null)}
        titre="Saisir un code de suivi"
        pied={
          <Bouton
            onClick={() => {
              if (verifier(saisie ?? '')) setSaisie(null);
              else afficherErreur(new Error('Ce code ne fait pas partie de la mission.'));
            }}
            disabled={!saisie}
          >
            Vérifier
          </Bouton>
        }
      >
        <Champ libelle="Code de suivi (étiquette du colis)" value={saisie ?? ''} onChange={(e) => setSaisie(e.target.value)} placeholder="CL-261125-7KXD2F" autoFocus />
      </Modale>
    </Page>
  );
}
