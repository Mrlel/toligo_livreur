import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, Truck } from 'lucide-react';

import { AvatarInitiales, Cascade, OngletsSegmentes, Page, Pastille, VueDonnees } from '../../composants';
import { Routes } from '../../commun/routes';
import { useSession } from '../../session/Session';
import { heure, jourMois, estAujourdhui } from '../../utils/formatage';
import { useActualisation, useDonnees } from '../../utils/useDonnees';
import { BlocEspeces } from '../livraisons/LivraisonsPage';
import { MOTIFS_ECHEC, chargerActivite } from './api';
import './activite.css';

const PERIODES = [
  { cle: 'jour', libelle: 'Aujourd’hui' },
  { cle: 'semaine', libelle: 'Semaine' },
  { cle: 'mois', libelle: 'Mois' },
];

/**
 * « Mon activité » (maquette LV-Activite) : chiffres de la période, espèces à
 * reverser, historique des missions et tournées closes.
 */
export default function ActivitePage() {
  const { profil } = useSession();
  const [periode, setPeriode] = useState('jour');
  const activite = useDonnees(() => chargerActivite(periode), [periode]);
  useActualisation(activite.recharger);

  return (
    <Page titre="Mon activité" largeur="moyenne">
      <div className="activite__entete">
        <h1 className="activite__titre">Mon activité</h1>
        <Link to={Routes.profil} aria-label="Mon profil" style={{ borderRadius: '50%' }}>
          <AvatarInitiales nom={profil?.nomComplet} taille={44} fond="var(--encre)" couleur="var(--blanc)" />
        </Link>
      </div>

      <OngletsSegmentes onglets={PERIODES} courant={periode} onChoisir={setPeriode} />

      <VueDonnees etat={activite} messageChargement="Chargement de votre activité…">
        {({ compteurs, especes, historique }) => (
          <div className="pile" style={{ gap: 14, marginTop: 14 }}>
            <div className="tuiles-stats">
              <TuileStat nombre={compteurs.missionsTerminees} libelle={`mission${compteurs.missionsTerminees > 1 ? 's' : ''} terminée${compteurs.missionsTerminees > 1 ? 's' : ''}`} />
              <TuileStat nombre={compteurs.colisLivres} libelle="colis livrés" />
              <TuileStat nombre={compteurs.colisRamasses} libelle="colis ramassés" />
              <TuileStat
                nombre={compteurs.livraisonsEchouees}
                libelle={`livraison${compteurs.livraisonsEchouees > 1 ? 's' : ''} échouée${compteurs.livraisonsEchouees > 1 ? 's' : ''}`}
                accent={compteurs.livraisonsEchouees > 0}
              />
            </div>

            <BlocEspeces
              montant={especes.detenues}
              plafond={especes.plafond}
              sombre
              note={especes.station ? `À remettre à la ${especes.station}.` : 'À remettre à votre station.'}
            />

            <section>
              <div className="titre-bloc">
                <span className="etiquette-section">Historique</span>
              </div>
              {historique.length === 0 ? (
                <p className="texte-secondaire" style={{ fontSize: 14, padding: '4px 2px' }}>
                  Aucune mission ni tournée terminée sur cette période.
                </p>
              ) : (
                <Cascade className="liste-carte">
                  {historique.map((ligne) => (
                    <LigneHistorique key={`${ligne.type}-${ligne.id}`} ligne={ligne} />
                  ))}
                </Cascade>
              )}
            </section>
          </div>
        )}
      </VueDonnees>
    </Page>
  );
}

function TuileStat({ nombre, libelle, accent = false }) {
  return (
    <div className={`tuile-stat${accent ? ' tuile-stat--accent' : ''}`}>
      <span className="tuile-stat__nombre">{nombre}</span>
      <span className="tuile-stat__libelle">{libelle}</span>
    </div>
  );
}

/** « MS-261125-7KXD · Didier K. — 2 colis · remis à 10:12 — Livrée ». */
function LigneHistorique({ ligne }) {
  const estTournee = ligne.type === 'tournee';
  const quand = ligne.date ? `${estAujourdhui(ligne.date) ? '' : `${jourMois(ligne.date)} `}${heure(ligne.date)}` : '';
  const nomCourt = ligne.titre ? abreger(ligne.titre) : null;

  let detail;
  let pastille;
  if (estTournee) {
    detail = `${ligne.nbColis} colis · terminé à ${quand}`;
    pastille = { libelle: 'Terminée', ton: 'neutre' };
  } else if (ligne.statut === 'echouee') {
    detail = `${MOTIFS_ECHEC[ligne.motif] ?? 'Échec'} · ${quand}`;
    pastille = { libelle: 'Échec', ton: 'erreur' };
  } else {
    detail = `${ligne.nbColis} colis · remis à ${quand}`;
    pastille = { libelle: 'Livrée', ton: 'succes' };
  }

  return (
    <div className="liste-carte__ligne">
      <span className="activite__icone" aria-hidden="true">
        {estTournee ? <Truck size={20} /> : <Package size={20} />}
      </span>
      <span className="liste-carte__texte">
        <span className="liste-carte__titre une-ligne" style={{ display: 'block' }}>
          {estTournee ? `Ramassage ${ligne.reference}` : `${ligne.reference}${nomCourt ? ` · ${nomCourt}` : ''}`}
        </span>
        <span className="liste-carte__detail une-ligne" style={{ display: 'block' }}>
          {detail}
        </span>
      </span>
      <Pastille ton={pastille.ton}>{pastille.libelle}</Pastille>
    </div>
  );
}

/** « Didier Konan » -> « Didier K. ». */
function abreger(nom) {
  const mots = nom.trim().split(/\s+/);
  return mots.length > 1 ? `${mots[0]} ${mots[1][0]}.` : mots[0];
}
