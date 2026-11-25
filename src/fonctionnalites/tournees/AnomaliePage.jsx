import { useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Info, Lock, Package, TriangleAlert } from 'lucide-react';

import { Bouton, Champ, EncadreInfo, EnTete, Option, Page, PiedDAction, Puce, VueDonnees, useMessages } from '../../composants';
import { Routes } from '../../commun/routes';
import { useDonnees } from '../../utils/useDonnees';
import { detailTournee, signalerAnomalie } from './api';
import './tournees.css';

/** Problèmes fréquents, pour ne pas tout taper au téléphone. */
const PROBLEMES = [
  { cle: 'ouverture', titre: 'Le box ne s’ouvre pas', icone: Lock },
  { cle: 'colis', titre: 'Un colis manque', icone: Package },
  { cle: 'endommage', titre: 'Box endommagé', icone: TriangleAlert },
  { cle: 'autre', titre: 'Autre problème', icone: Info },
];

/**
 * Signaler un problème sur un box (maquette LV-Ram-Anomalie) : quel box,
 * quel problème, description. Un incident est ouvert ; les colis du box
 * restent en place pour la tournée suivante.
 */
export default function AnomaliePage() {
  const { id } = useParams();
  const detail = useDonnees(() => detailTournee(id), [id]);

  return (
    <VueDonnees etat={detail} messageChargement="Chargement de la tournée…">
      {({ tournee }) => (tournee.statut === 'en_cours' && tournee.monRole !== 'aide' ? <Signalement tournee={tournee} /> : <Navigate to={Routes.tournee(id)} replace />)}
    </VueDonnees>
  );
}

function Signalement({ tournee }) {
  const naviguer = useNavigate();
  const [parametres] = useSearchParams();
  const { afficherMessage, afficherErreur } = useMessages();

  // Entrepôt du passage en cours (ou celui passé dans l'adresse).
  const arret = tournee.arrets.find((a) => a.entrepot?.id === parametres.get('site')) ?? tournee.arrets.find((a) => !a.passageTermine);
  const boxes = (arret?.passages ?? []).filter((passage) => passage.etat === 'a_visiter');

  const [passageId, setPassageId] = useState(boxes[0]?.id ?? null);
  const [probleme, setProbleme] = useState('ouverture');
  const [description, setDescription] = useState('');
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const retour = () => naviguer(Routes.tournee(tournee.id), { replace: true });

  async function envoyer() {
    const choisi = PROBLEMES.find((p) => p.cle === probleme);
    if (probleme === 'autre' && !description.trim()) {
      setErreur('Décrivez le problème.');
      return;
    }
    setEnCours(true);
    try {
      const texte = description.trim() ? `${choisi.titre} : ${description.trim()}` : choisi.titre;
      await signalerAnomalie(tournee.id, passageId, texte);
      afficherMessage('Problème signalé à l’équipe Tôligo. Les colis de ce box restent en place.');
      retour();
    } catch (e) {
      afficherErreur(e);
      setEnCours(false);
    }
  }

  return (
    <Page
      titre="Signaler un problème"
      entete={<EnTete titre="Signaler un problème" sousTitre={arret?.entrepot?.nom} fermer gris onRetour={retour} />}
      pied={
        <PiedDAction arrondi>
          <Bouton variante="rouge" icone={TriangleAlert} enCours={enCours} disabled={!passageId} onClick={envoyer}>
            Signaler le problème
          </Bouton>
        </PiedDAction>
      }
    >
      {boxes.length === 0 ? (
        <EncadreInfo>Tous les box de cet entrepôt sont déjà traités.</EncadreInfo>
      ) : (
        <>
          <div className="titre-bloc">
            <span className="etiquette-section">Quel box ?</span>
          </div>
          <div className="rangee" style={{ gap: 8, flexWrap: 'wrap' }}>
            {boxes.map((passage) => (
              <Puce key={passage.id} choisie={passage.id === passageId} onClick={() => setPassageId(passage.id)}>
                {passage.box?.numero ?? 'Box'}
              </Puce>
            ))}
          </div>

          <div className="titre-bloc" style={{ marginTop: 18 }}>
            <span className="etiquette-section">Problème</span>
          </div>
          <div className="pile" style={{ gap: 10 }}>
            {PROBLEMES.map(({ cle, titre, icone: Icone }) => (
              <Option key={cle} choisie={probleme === cle} onClick={() => setProbleme(cle)}>
                <span className={`icone-option${probleme === cle ? ' icone-option--choisie' : ''}`}>
                  <Icone size={20} aria-hidden="true" />
                </span>
                <span className="extensible gras" style={{ fontSize: 15.5 }}>
                  {titre}
                </span>
              </Option>
            ))}
          </div>

          <div style={{ marginTop: 18 }}>
            <Champ
              libelle="Décrivez le problème"
              facultatif={probleme !== 'autre'}
              multiligne
              lignes={2}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setErreur(null);
              }}
              erreur={erreur}
              placeholder="Le box reste fermé avec l’application TTLock."
              maxLength={900}
            />
          </div>

          <div style={{ marginTop: 14 }}>
            <EncadreInfo>Un incident est ouvert. Les colis de ce box restent en place pour la tournée suivante.</EncadreInfo>
          </div>
        </>
      )}
    </Page>
  );
}
