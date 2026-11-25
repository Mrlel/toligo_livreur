import { useState } from 'react';
import { LocateFixed, LogOut, Star, Truck, Warehouse } from 'lucide-react';

import { AvatarInitiales, EnTete, Interrupteur, Page, Pastille, useConfirmation } from '../../composants';
import { texteEtatPosition, usePosition } from '../../commun/Position';
import { Routes } from '../../commun/routes';
import { useSession } from '../../session/Session';
import { afficher as afficherTelephone } from '../../utils/telephone';
import { useDonnees } from '../../utils/useDonnees';
import { listerMissions, nomVehicule } from '../livraisons/api';
import { listerTournees } from '../tournees/api';
import { seDeconnecter } from './api';
import './profil.css';

/**
 * Mon profil (maquette LV-Profil) : identité, rôles, station, véhicule en
 * cours, note, partage de position et déconnexion. Le compte, la station et
 * les véhicules sont gérés par le superadmin : rien ne se modifie ici.
 */
export default function ProfilPage() {
  const { profil, fermer } = useSession();
  const { etat: etatPosition, partageActive, changerPartage } = usePosition();
  const confirmer = useConfirmation();
  const [enCours, setEnCours] = useState(false);

  // Véhicule en cours : celui de la mission, sinon celui de la tournée démarrée.
  const vehicule = useDonnees(async () => {
    const [missions, tournees] = await Promise.all([
      profil?.estLivreurDomicile ? listerMissions() : Promise.resolve({ missions: [] }),
      listerTournees(),
    ]);
    const mission = missions.missions.find((m) => m.vehicule);
    if (mission) return mission.vehicule;
    return tournees.find((t) => t.statut === 'en_cours' && t.vehicule)?.vehicule ?? null;
  }, [profil?.estLivreurDomicile]);

  async function deconnecter() {
    const ok = await confirmer({
      titre: 'Se déconnecter ?',
      texte: 'Vous devrez saisir à nouveau votre numéro et votre mot de passe.',
      accepter: 'Se déconnecter',
      danger: true,
    });
    if (!ok) return;
    setEnCours(true);
    try {
      await seDeconnecter();
    } catch {
      // Jeton déjà expiré ou réseau coupé : on ferme la session quand même.
    }
    fermer();
  }

  async function basculerPartage(actif) {
    if (!actif) {
      const ok = await confirmer({
        titre: 'Couper le partage ?',
        texte: 'Votre station ne vous verra plus sur la carte et ne pourra pas choisir le livreur le plus proche.',
        accepter: 'Couper',
      });
      if (!ok) return;
    }
    changerPartage(actif);
  }

  return (
    <Page
      titre="Mon profil"
      entete={<EnTete titre="Mon profil" gris repli={Routes.accueil} />}
      pied={
        <button type="button" className="profil__deconnexion" onClick={deconnecter} disabled={enCours}>
          <LogOut size={20} aria-hidden="true" />
          Se déconnecter
        </button>
      }
    >
      <div className="profil__identite">
        <AvatarInitiales nom={profil?.nomComplet} taille={76} fond="var(--encre)" couleur="var(--blanc)" />
        <p className="profil__nom">{profil?.nomComplet ?? ' '}</p>
        <p className="profil__telephone">{profil ? `+225 ${afficherTelephone(profil.telephone)}` : ''}</p>
        <div className="rangee" style={{ gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {profil?.estChauffeur && <Pastille ton="sombre">Chauffeur de ramassage</Pastille>}
          {profil?.estLivreurDomicile && <Pastille ton="accent">Livreur à domicile</Pastille>}
        </div>
      </div>

      <div className="liste-carte">
        <LigneProfil icone={Warehouse} libelle="Station" valeur={profil?.station?.nom ?? 'Aucune'} />
        <LigneProfil
          icone={Truck}
          libelle="Véhicule actuel"
          valeur={vehicule.donnees ? nomVehicule(vehicule.donnees) : 'Attribué à chaque mission'}
          discrete={!vehicule.donnees}
        />
        <LigneProfil
          icone={Star}
          libelle="Note moyenne"
          valeur={profil?.noteMoyenne ? `${profil.noteMoyenne.toFixed(1).replace('.', ',')} / 5` : 'Pas encore notée'}
          discrete={!profil?.noteMoyenne}
        />
      </div>

      <div className="profil__position">
        <span className="profil__position-icone" aria-hidden="true">
          <LocateFixed size={22} />
        </span>
        <span className="extensible">
          <span className="profil__position-titre">Partager ma position</span>
          <span className="profil__position-texte">
            {partageActive && etatPosition !== 'refusee' && etatPosition !== 'indisponible'
              ? 'Pendant le service, pour le suivi'
              : texteEtatPosition(etatPosition)}
          </span>
        </span>
        <Interrupteur actif={partageActive} onChange={basculerPartage} libelle="Partager ma position" />
      </div>

      <p className="profil__note">Compte, station et véhicules gérés par le superadmin Tôligo.</p>
    </Page>
  );
}

function LigneProfil({ icone: Icone, libelle, valeur, discrete = false }) {
  return (
    <div className="liste-carte__ligne">
      <span className="profil__icone" aria-hidden="true">
        <Icone size={20} />
      </span>
      <span className="liste-carte__texte texte-secondaire" style={{ fontSize: 15 }}>
        {libelle}
      </span>
      <span className={discrete ? 'texte-secondaire' : 'gras'} style={{ fontSize: 15, textAlign: 'right' }}>
        {valeur}
      </span>
    </div>
  );
}
