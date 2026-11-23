import { useState } from 'react';
import { LocateFixed, LogOut, Star } from 'lucide-react';

import { AvatarInitiales, BlocGris, Bouton, EncadreInfo, LigneInfo, Page, Pastille, TitreEcran, useConfirmation } from '../../composants';
import { texteEtatPosition, usePosition } from '../../commun/Position';
import { useSession } from '../../session/Session';
import { afficher as afficherTelephone } from '../../utils/telephone';
import { infosStatut, libelleVehicule, seDeconnecter } from './api';
import './profil.css';

/**
 * Profil du livreur : identité, rôles, véhicule, partage de position, et
 * déconnexion. Les informations sont tenues par l'administration Tôligo :
 * rien ne se modifie ici.
 */
export default function ProfilPage() {
  const { profil, fermer } = useSession();
  const { etat: etatPosition } = usePosition();
  const confirmer = useConfirmation();
  const [enCours, setEnCours] = useState(false);

  const statut = infosStatut(profil?.statut);

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

  const roles = [profil?.estChauffeur && 'Chauffeur de ramassage', profil?.estLivreurDomicile && 'Livreur à domicile'].filter(Boolean);

  return (
    <Page titre="Profil">
      <TitreEcran>Profil</TitreEcran>

      <div className="profil__identite">
        <AvatarInitiales nom={profil?.nomComplet} taille={72} accent />
        <div className="extensible">
          <p className="titre profil__nom">{profil?.nomComplet ?? ' '}</p>
          <p className="texte-secondaire">{profil ? `+225 ${afficherTelephone(profil.telephone)}` : ''}</p>
          {profil && (
            <div style={{ marginTop: 8 }}>
              <Pastille ton={statut.ton} petite>
                {statut.libelle}
              </Pastille>
            </div>
          )}
        </div>
      </div>

      <div className="pile" style={{ gap: 18 }}>
        <section>
          <p className="etiquette-section" style={{ marginBottom: 8 }}>
            Mon activité
          </p>
          <BlocGris style={{ padding: 4 }}>
            <LigneInfo libelle={roles.length > 1 ? 'Rôles' : 'Rôle'} valeur={roles.length > 0 ? roles.join(' · ') : 'Aucun'} />
            {profil?.noteMoyenne !== null && profil?.noteMoyenne !== undefined && (
              <LigneInfo
                libelle="Note des clients"
                valeur={
                  <span className="rangee" style={{ gap: 4, justifyContent: 'flex-end' }}>
                    <Star size={15} fill="currentColor" className="texte-accent" aria-hidden="true" />
                    {profil.noteMoyenne.toFixed(1).replace('.', ',')} / 5
                  </span>
                }
              />
            )}
            {profil?.email && <LigneInfo libelle="E-mail" valeur={profil.email} />}
          </BlocGris>
        </section>

        <section>
          <p className="etiquette-section" style={{ marginBottom: 8 }}>
            Véhicule
          </p>
          <BlocGris style={{ padding: 4 }}>
            {profil?.vehicule ? (
              <>
                <LigneInfo libelle={libelleVehicule(profil.vehicule.type)} valeur={profil.vehicule.immatriculation || '—'} />
                {profil.vehicule.capaciteKg > 0 && <LigneInfo libelle="Capacité" valeur={`${profil.vehicule.capaciteKg} kg`} />}
              </>
            ) : (
              <LigneInfo libelle="Véhicule" valeur="Aucun attribué" />
            )}
          </BlocGris>
        </section>

        <EncadreInfo icone={LocateFixed}>
          {texteEtatPosition(etatPosition)} La position n'est envoyée que lorsque vous êtes « Disponible » ou « En mission ».
        </EncadreInfo>

        <p className="texte-secondaire" style={{ fontSize: 13, lineHeight: 1.45 }}>
          Une information à corriger ? Votre profil est tenu par l'équipe Tôligo : adressez-vous au gestionnaire de votre station.
        </p>

        <Bouton variante="contour-danger" icone={LogOut} enCours={enCours} onClick={deconnecter}>
          Se déconnecter
        </Bouton>
      </div>
    </Page>
  );
}
