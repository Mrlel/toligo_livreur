import { Link, NavLink, useLocation } from 'react-router-dom';
import { House, Package, Truck, User } from 'lucide-react';

import { AvatarInitiales } from '../composants';
import { infosStatut } from '../fonctionnalites/profil/api';
import { useSession } from '../session/Session';
import EcransAnimes from './EcransAnimes';
import { Routes, ROUTES_ONGLETS } from './routes';

/**
 * Cadre des écrans du livreur connecté, comme dans l'application client.
 *
 * - Sur ordinateur : barre de navigation à gauche, toujours visible.
 * - Sur téléphone : onglets en bas, sur les quatre écrans principaux.
 *
 * L'onglet « Livraisons » n'apparaît qu'aux livreurs à domicile, l'onglet
 * « Tournées » qu'aux chauffeurs de ramassage (un livreur peut être les deux).
 */
const ONGLETS = [
  { vers: Routes.accueil, libelle: 'Accueil', icone: House },
  { vers: Routes.livraisons, libelle: 'Livraisons', icone: Package, role: 'estLivreurDomicile' },
  { vers: Routes.tournees, libelle: 'Tournées', icone: Truck, role: 'estChauffeur' },
  { vers: Routes.profil, libelle: 'Profil', icone: User },
];

/** Onglets du livreur ; tous tant que le profil n'est pas chargé. */
function ongletsDe(profil) {
  return ONGLETS.filter((onglet) => !onglet.role || !profil || profil[onglet.role]);
}

export default function Coquille() {
  const { pathname } = useLocation();
  const avecOnglets = ROUTES_ONGLETS.includes(pathname);

  return (
    <div className={`coquille${avecOnglets ? ' coquille--avec-onglets' : ''}`}>
      <BarreLaterale />
      <div className="coquille__contenu">
        <EcransAnimes />
      </div>
      {avecOnglets && <OngletsBas />}
    </div>
  );
}

/** Logo « Tôligo. » suivi de la pastille « Livreur ». */
export function Logo({ className = '' }) {
  return (
    <span className={`logo ${className}`}>
      Tôligo<span className="logo__point">.</span>
      <span className="logo__badge">Livreur</span>
    </span>
  );
}

/** Navigation de gauche (ordinateur). */
function BarreLaterale() {
  const { profil } = useSession();
  const statut = infosStatut(profil?.statut);

  return (
    <nav className="barre-laterale" aria-label="Navigation principale">
      <Link to={Routes.accueil} className="barre-laterale__logo">
        <Logo />
      </Link>
      {ongletsDe(profil).map(({ vers, libelle, icone: Icone }) => (
        <NavLink key={vers} to={vers} className="barre-laterale__lien">
          <Icone size={21} />
          {libelle}
        </NavLink>
      ))}

      <div className="barre-laterale__bas">
        <Link to={Routes.profil} className="barre-laterale__profil">
          <AvatarInitiales nom={profil?.nomComplet} taille={40} />
          <span className="extensible">
            <span className="une-ligne" style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>
              {profil?.nomComplet ?? ' '}
            </span>
            {profil && (
              <span className="statut-ligne" style={{ fontSize: 12.5 }}>
                <span className="point-statut" style={{ background: statut.couleur }} />
                {statut.libelle}
              </span>
            )}
          </span>
        </Link>
      </div>
    </nav>
  );
}

/** Onglets du bas (téléphone). Icônes au trait : l'onglet actif est plus foncé. */
function OngletsBas() {
  const { profil } = useSession();
  return (
    <nav className="onglets-bas" aria-label="Navigation principale">
      {ongletsDe(profil).map(({ vers, libelle, icone: Icone }) => (
        <NavLink key={vers} to={vers} className="onglets-bas__onglet">
          {({ isActive }) => (
            <>
              <Icone size={22} strokeWidth={isActive ? 2.2 : 1.8} />
              {libelle}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
