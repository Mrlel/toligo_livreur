import { useNavigate } from 'react-router-dom';
import { Banknote, Package, RefreshCw } from 'lucide-react';

import { BoutonRond, Cascade, Illustration, Page, Pastille, TitreEcran, VueDonnees, VueVide, cliquable } from '../../composants';
import { Routes } from '../../commun/routes';
import { prix } from '../../utils/formatage';
import { useActualisation, useDonnees } from '../../utils/useDonnees';
import { infosStatutMission, listerMissions, nombreDeColis } from './api';
import './livraisons.css';

/**
 * Onglet « Mission » : livraisons à domicile en cours du livreur, dans
 * l'ordre d'affectation, puis les espèces à reverser.
 *
 * La liste se recharge toute seule (toutes les minutes, et au retour sur
 * l'application) : une livraison affectée par la station apparaît sans action.
 */
export default function LivraisonsPage() {
  const donnees = useDonnees(listerMissions, []);
  useActualisation(donnees.recharger);

  return (
    <Page titre="Mission" largeur="moyenne">
      <TitreEcran action={<BoutonRond icone={RefreshCw} libelle="Actualiser" onClick={donnees.recharger} />}>Missions</TitreEcran>

      <VueDonnees etat={donnees} messageChargement="Chargement de vos missions…">
        {({ missions, especesDetenues, plafondEspeces }) => (
          <div className="pile" style={{ gap: 14 }}>
            {missions.length === 0 ? (
              <VueVide
                icone={Package}
                titre="Aucune mission pour le moment"
                message="Le gestionnaire de votre station vous affecte les livraisons. Restez « Disponible » pour en recevoir."
              />
            ) : (
              <Cascade className="pile" style={{ gap: 10 }}>
                {missions.map((mission) => (
                  <CarteMission key={mission.id} mission={mission} />
                ))}
              </Cascade>
            )}

            {especesDetenues > 0 && <BlocEspeces montant={especesDetenues} plafond={plafondEspeces} />}
          </div>
        )}
      </VueDonnees>
    </Page>
  );
}

/** Carte d'une livraison (maquette LV-Accueil) : colis, destinataire, montant. */
export function CarteMission({ mission }) {
  const naviguer = useNavigate();
  const statut = infosStatutMission(mission.statut);

  return (
    <div className="carte-jour" {...cliquable(() => naviguer(Routes.livraison(mission.id)))}>
      <span className="tuile tuile--accent">
        <Illustration nom="colis-moyen" taille={46} carre={false} />
      </span>
      <span className="carte-jour__texte">
        <span className="carte-jour__haut">
          <span className="carte-jour__titre une-ligne">Mission en cours</span>
          <Pastille ton={statut.ton} petite>
            {statut.libelle}
          </Pastille>
        </span>
        <span className="carte-jour__ligne une-ligne">
          {mission.destinataire.nom || 'Destinataire'} · {nombreDeColis(mission)}
        </span>
        <span className="carte-jour__ligne carte-jour__ligne--forte une-ligne">
          {mission.montantAEncaisser > 0 ? `À encaisser : ${prix(mission.montantAEncaisser)}` : 'Déjà payée en ligne'}
        </span>
      </span>
    </div>
  );
}

/**
 * Espèces encaissées à reverser à la station, avec la jauge vers le plafond
 * fixé par l'administration (pas de jauge tant qu'il n'est pas saisi).
 * `sombre` : version noire de l'écran « Mon activité ».
 */
export function BlocEspeces({ montant, plafond, sombre = false, note, onClick }) {
  const part = plafond ? Math.min(1, montant / plafond) : null;

  return (
    <div className={`bloc-especes${sombre ? ' bloc-especes--sombre' : ''}`} {...(onClick ? cliquable(onClick) : {})}>
      <span className="bloc-especes__haut">
        <span className="bloc-especes__libelle">
          <Banknote size={20} aria-hidden="true" />
          Espèces à reverser
        </span>
        <span className="bloc-especes__montant">
          <b>{prix(montant)}</b>
          {plafond ? ` / ${prix(plafond)}` : ''}
        </span>
      </span>
      {part !== null && (
        <span className="jauge" role="progressbar" aria-valuenow={Math.round(part * 100)} aria-valuemin={0} aria-valuemax={100}>
          <span className="jauge__barre" style={{ width: `${Math.max(2, part * 100)}%` }} />
        </span>
      )}
      {note && <span style={{ fontSize: 13.5, color: sombre ? '#c6c6cb' : 'var(--texte-secondaire)' }}>{note}</span>}
    </div>
  );
}
