import { MotionConfig } from 'motion/react';
import { BrowserRouter, Navigate, Outlet, Route, Routes as ListeRoutes } from 'react-router-dom';

import Coquille from './commun/Coquille';
import { FournisseurPosition } from './commun/Position';
import { Routes } from './commun/routes';
import { FournisseurConfirmation, FournisseurMessages } from './composants';
import { FournisseurSession, useSession } from './session/Session';

import AccueilPage from './fonctionnalites/accueil/AccueilPage';
import ConnexionPage from './fonctionnalites/authentification/ConnexionPage';
import LivraisonPage from './fonctionnalites/livraisons/LivraisonPage';
import LivraisonsPage from './fonctionnalites/livraisons/LivraisonsPage';
import RemisePage from './fonctionnalites/livraisons/RemisePage';
import ProfilPage from './fonctionnalites/profil/ProfilPage';
import TourneePage from './fonctionnalites/tournees/TourneePage';
import TourneesPage from './fonctionnalites/tournees/TourneesPage';

/** Écrans réservés au livreur connecté ; sinon, direction la connexion. */
function RoutesPrivees() {
  const { estConnecte } = useSession();
  if (!estConnecte) return <Navigate to={Routes.connexion} replace />;
  // Position partagée seulement une fois connecté (voir commun/Position.jsx).
  return (
    <FournisseurPosition>
      <Outlet />
    </FournisseurPosition>
  );
}

/** Connexion : inutile une fois connecté. */
function RoutePublique({ children }) {
  const { estConnecte } = useSession();
  return estConnecte ? <Navigate to={Routes.accueil} replace /> : children;
}

/**
 * Application web des livreurs Tôligo : chauffeurs de ramassage (tournées)
 * et livreurs à domicile (livraisons).
 */
export default function App() {
  // reducedMotion="user" : si le téléphone demande moins d'animations, les
  // glissements sont supprimés (seuls les fondus restent).
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <FournisseurSession>
          <FournisseurMessages>
            <FournisseurConfirmation>
              <ListeRoutes>
                <Route
                  path={Routes.connexion}
                  element={
                    <RoutePublique>
                      <ConnexionPage />
                    </RoutePublique>
                  }
                />

                <Route element={<RoutesPrivees />}>
                  <Route element={<Coquille />}>
                    {/* Écrans principaux */}
                    <Route path={Routes.accueil} element={<AccueilPage />} />
                    <Route path={Routes.livraisons} element={<LivraisonsPage />} />
                    <Route path={Routes.tournees} element={<TourneesPage />} />
                    <Route path={Routes.profil} element={<ProfilPage />} />

                    {/* Livraison à domicile */}
                    <Route path="/livraisons/:id" element={<LivraisonPage />} />
                    <Route path="/livraisons/:id/remise" element={<RemisePage />} />

                    {/* Tournée de ramassage */}
                    <Route path="/tournees/:id" element={<TourneePage />} />
                  </Route>
                </Route>

                <Route path="*" element={<Navigate to={Routes.accueil} replace />} />
              </ListeRoutes>
            </FournisseurConfirmation>
          </FournisseurMessages>
        </FournisseurSession>
      </BrowserRouter>
    </MotionConfig>
  );
}
