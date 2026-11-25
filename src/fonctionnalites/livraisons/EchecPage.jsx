import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Banknote, Info, MapPin, TriangleAlert, Undo2, User } from 'lucide-react';

import { Bouton, Champ, EncadreInfo, EnTete, Option, Page, PiedDAction, VueDonnees, useMessages } from '../../composants';
import { Routes } from '../../commun/routes';
import { useSession } from '../../session/Session';
import { useDonnees } from '../../utils/useDonnees';
import { detailMission, refusDePaiement, signalerEchec } from './api';
import './livraisons.css';

/** Motifs proposés ; « refus de payer » seulement s'il reste à encaisser. */
const MOTIFS = [
  { cle: 'destinataire_absent', titre: 'Destinataire absent', texte: 'Personne sur place à l’adresse', icone: User },
  { cle: 'adresse_incorrecte', titre: 'Adresse incorrecte', texte: 'L’adresse n’existe pas ou est introuvable', icone: MapPin },
  { cle: 'refus_paiement', titre: 'Refus de payer', texte: 'Le destinataire ne veut pas régler', icone: Banknote, aEncaisser: true },
];

/**
 * Livraison impossible (maquette LV-Liv-Echec) : le livreur choisit le motif,
 * ajoute un commentaire s'il veut, puis confirme. Un incident est ouvert, la
 * mission échoue et le livreur redevient disponible.
 */
export default function EchecPage() {
  const { id } = useParams();
  const mission = useDonnees(() => detailMission(id), [id]);

  return (
    <VueDonnees etat={mission} messageChargement="Chargement de la mission…">
      {(m) => (m.statut === 'en_route_livraison' ? <Echec mission={m} /> : <Navigate to={Routes.livraison(m.id)} replace />)}
    </VueDonnees>
  );
}

function Echec({ mission }) {
  const naviguer = useNavigate();
  const { state } = useLocation();
  const { afficherMessage, afficherErreur } = useMessages();
  const { rechargerProfil } = useSession();

  const motifs = MOTIFS.filter((motif) => !motif.aEncaisser || mission.montantAEncaisser > 0);
  const [motif, setMotif] = useState(motifs.some((m) => m.cle === state?.motif) ? state.motif : 'destinataire_absent');
  const [commentaire, setCommentaire] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function confirmer() {
    setEnCours(true);
    try {
      if (motif === 'refus_paiement') await refusDePaiement(mission.id, commentaire);
      else await signalerEchec(mission.id, motif, commentaire);
      afficherMessage(
        motif === 'refus_paiement'
          ? 'Refus enregistré : rapportez les colis à la station, ils repartiront chez l’expéditeur.'
          : 'Échec enregistré : rapportez les colis à la station.',
      );
      rechargerProfil();
      naviguer(Routes.accueil, { replace: true });
    } catch (erreur) {
      afficherErreur(erreur);
      setEnCours(false);
    }
  }

  return (
    <Page
      titre="Livraison impossible"
      entete={<EnTete titre="Livraison impossible" sousTitre={`${mission.destinataire.nom} · ${mission.reference}`} fermer gris repli={Routes.livraison(mission.id)} />}
      pied={
        <PiedDAction arrondi>
          <Bouton variante="rouge" icone={TriangleAlert} enCours={enCours} onClick={confirmer}>
            Confirmer l’échec
          </Bouton>
        </PiedDAction>
      }
    >
      <div className="titre-bloc">
        <span className="etiquette-section">Que se passe-t-il ?</span>
      </div>
      <div className="pile" style={{ gap: 10 }}>
        {motifs.map(({ cle, titre, texte, icone: Icone }) => (
          <Option key={cle} choisie={motif === cle} onClick={() => setMotif(cle)}>
            <span className={`icone-option${motif === cle ? ' icone-option--choisie' : ''}`}>
              <Icone size={22} aria-hidden="true" />
            </span>
            <span className="extensible">
              <span className="option__titre">{titre}</span>
              <span className="option__texte">{texte}</span>
            </span>
          </Option>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>
        <Champ
          libelle="Commentaire"
          facultatif
          multiligne
          lignes={2}
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          placeholder="Portail fermé, pas de réponse à l’interphone…"
          maxLength={1000}
        />
      </div>

      <div className="pile" style={{ gap: 10, marginTop: 14 }}>
        <EncadreInfo icone={Undo2}>
          Un incident est ouvert et la mission échoue. Rapportez les colis à la {mission.station?.nom ?? 'station'} : ils y restent à disposition. Vous
          redevenez disponible.
        </EncadreInfo>
        {motif === 'refus_paiement' && (
          <EncadreInfo icone={Info} accent>
            Refus de payer : après plusieurs refus, le paiement à la livraison est désactivé pour ce numéro et le colis repart chez l’expéditeur.
          </EncadreInfo>
        )}
      </div>
    </Page>
  );
}
