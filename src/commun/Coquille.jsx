import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChartNoAxesColumn, House, Package, Truck } from 'lucide-react';

import { AvatarInitiales } from '../composants';
import { infosStatut } from '../fonctionnalites/profil/api';
import { useSession } from '../session/Session';
import EcransAnimes from './EcransAnimes';
import { Routes, ROUTES_ONGLETS } from './routes';

/**
 * Cadre des écrans du livreur connecté (maquettes LV-*).
 *
 * - Sur téléphone : onglets en bas (Accueil, Ramassage, Mission, Activité),
 *   l'onglet choisi en noir avec un point orange ; le profil s'ouvre par
 *   l'avatar de l'accueil.
 * - Sur ordinateur : barre de navigation à gauche.
 *
 * « Ramassage » n'apparaît qu'aux chauffeurs de ramassage, « Mission »
 * qu'aux livreurs à domicile (un livreur peut être les deux).
 */
const ONGLETS = [
  { vers: Routes.accueil, libelle: 'Accueil', icone: House },
  { vers: Routes.tournees, libelle: 'Ramassage', icone: Truck, role: 'estChauffeur' },
  { vers: Routes.livraisons, libelle: 'Mission', icone: Package, role: 'estLivreurDomicile' },
  { vers: Routes.activite, libelle: 'Activité', icone: ChartNoAxesColumn },
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
          <AvatarInitiales nom={profil?.nomComplet} taille={40} fond="var(--encre)" couleur="var(--blanc)" />
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

/** Onglets du bas (téléphone) : actif en noir, avec un point orange dessous. */
function OngletsBas() {
  const { profil } = useSession();
  return (
    <nav className="onglets-bas" aria-label="Navigation principale">
      {ongletsDe(profil).map(({ vers, libelle, icone: Icone }) => (
        <NavLink key={vers} to={vers} className="onglets-bas__onglet">
          {({ isActive }) => (
            <>
              <Icone size={22} strokeWidth={isActive ? 2 : 1.8} />
              {libelle}
              <span className={`onglets-bas__point${isActive ? ' onglets-bas__point--actif' : ''}`} aria-hidden="true" />
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
