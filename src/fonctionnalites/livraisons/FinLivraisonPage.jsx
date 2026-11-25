import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Banknote, Check, TriangleAlert } from 'lucide-react';

import { Bouton, Cascade, Illustration, Page, Pastille, PiedDAction, VueDonnees } from '../../composants';
import { Routes } from '../../commun/routes';
import { prix } from '../../utils/formatage';
import { useDonnees } from '../../utils/useDonnees';
import { detailMission, listerMissions } from './api';
import { LigneColis } from './LivraisonPage';
import './livraisons.css';

/**
 * Fin d'une livraison (maquette LV-Liv-Fin) : colis remis, preuve
 * enregistrée, espèces à reverser. Affiche aussi une mission échouée.
 */
export default function FinLivraisonPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const naviguer = useNavigate();
  const mission = useDonnees(() => detailMission(id), [id]);
  const especes = useDonnees(listerMissions, []);

  return (
    <Page
      titre="Livraison terminée"
      pied={
        <PiedDAction>
          <Bouton onClick={() => naviguer(Routes.accueil, { replace: true })}>Retour à l’accueil</Bouton>
        </PiedDAction>
      }
    >
      <VueDonnees etat={mission} messageChargement="Chargement de la mission…">
        {(m) => {
          const livree = m.statut === 'terminee';
          const preuve = state?.preuve === 'photo' ? 'photo de la remise' : 'code de retrait';
          const detenues = especes.donnees?.especesDetenues ?? 0;

          return (
            <div className="fin-livraison">
              <div className="fin-livraison__visuel">
                <Illustration nom="colis-moyen" taille={130} carre={false} />
                <span className={`fin-livraison__rond${livree ? '' : ' fin-livraison__rond--echec'}`} aria-hidden="true">
                  {livree ? <Check size={30} strokeWidth={3} /> : <TriangleAlert size={26} />}
                </span>
              </div>
              <h1 className="fin-livraison__titre">{livree ? 'Colis remis' : 'Livraison non effectuée'}</h1>
              <p className="fin-livraison__texte">
                {livree
                  ? 'Preuve enregistrée, mission terminée. Vous êtes de nouveau disponible.'
                  : `Rapportez les colis à la ${m.station?.nom ?? 'station'}. Vous êtes de nouveau disponible.`}
              </p>

              <Cascade className="liste-carte" style={{ width: '100%', marginTop: 22 }}>
                {m.colis.map((colis) => (
                  <LigneColis
                    key={colis.codeSuivi}
                    colis={colis}
                    detail={`${colis.format ?? 'Colis'}${livree ? ` · ${preuve}` : ''}`}
                    fin={<Pastille ton={livree ? 'succes' : 'erreur'}>{livree ? 'Livré' : 'Échec'}</Pastille>}
                  />
                ))}
                {detenues > 0 && (
                  <div className="liste-carte__ligne">
                    <span className="vignette-colis" aria-hidden="true">
                      <Banknote size={22} />
                    </span>
                    <span className="liste-carte__texte">
                      <span className="liste-carte__titre" style={{ display: 'block' }}>
                        Espèces à reverser
                      </span>
                      <span className="liste-carte__detail" style={{ display: 'block' }}>
                        À remettre à la {m.station?.nom ?? 'station'}
                      </span>
                    </span>
                    <span className="fin-livraison__montant">{prix(detenues)}</span>
                  </div>
                )}
              </Cascade>
            </div>
          );
        }}
      </VueDonnees>
    </Page>
  );
}
