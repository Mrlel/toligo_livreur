import { useEffect, useState } from 'react';
import { House, KeyRound, Truck } from 'lucide-react';

import { Bouton, ChampMotDePasse, ChampTelephone, EncadreInfo, useMessages } from '../../composants';
import { Logo } from '../../commun/Coquille';
import { useSession } from '../../session/Session';
import { normaliser, valider as validerTelephone } from '../../utils/telephone';
import { connecter } from './api';
import './connexion.css';

/**
 * Connexion du livreur : numéro de téléphone et mot de passe donnés par
 * Tôligo (pas d'inscription, les comptes sont créés par l'administration).
 *
 * Même gabarit que la connexion de l'application client : sur téléphone, le
 * formulaire et le bouton collé en bas ; sur ordinateur, l'illustration à
 * gauche et le formulaire à droite.
 */
export default function ConnexionPage() {
  const { ouvrir } = useSession();
  const { afficherErreur } = useMessages();

  const [telephone, setTelephone] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreurs, setErreurs] = useState({});
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    document.title = 'Connexion · Tôligo Livreur';
  }, []);

  async function seConnecter(evenement) {
    evenement.preventDefault();

    const nouvellesErreurs = {
      telephone: validerTelephone(telephone),
      motDePasse: motDePasse ? null : 'Saisissez votre mot de passe.',
    };
    setErreurs(nouvellesErreurs);
    if (nouvellesErreurs.telephone || nouvellesErreurs.motDePasse) return;

    setEnCours(true);
    try {
      const { jeton, profil } = await connecter(normaliser(telephone), motDePasse);
      // Une fois la session ouverte, l'application bascule d'elle-même vers l'accueil.
      ouvrir(jeton, profil);
    } catch (erreur) {
      setEnCours(false);
      afficherErreur(erreur);
    }
  }

  return (
    <div className="connexion">
      <aside className="connexion__visuel" aria-hidden="true">
        <p className="connexion__accroche">
          Du box à la porte, <em>chaque colis</em> compte.
        </p>
        <SceneLivreur />
      </aside>

      <form className="connexion__panneau" onSubmit={seConnecter} noValidate>
        <img className="connexion__camion" src="/illustrations/camion.png" alt="" />
        <Logo className="connexion__logo" />

        <div className="connexion__corps">
          <h1 className="connexion__titre">Espace livreur</h1>
          <p className="connexion__texte">Connectez-vous avec le numéro et le mot de passe que Tôligo vous a donnés.</p>

          <div className="connexion__formulaire">
            <ChampTelephone
              valeur={telephone}
              onChange={(valeur) => {
                setTelephone(valeur);
                setErreurs((ancien) => ({ ...ancien, telephone: null }));
              }}
              erreur={erreurs.telephone}
              autoFocus
            />
            <ChampMotDePasse
              value={motDePasse}
              onChange={(e) => {
                setMotDePasse(e.target.value);
                setErreurs((ancien) => ({ ...ancien, motDePasse: null }));
              }}
              erreur={erreurs.motDePasse}
              autoComplete="current-password"
            />
            <EncadreInfo icone={KeyRound}>
              Mot de passe oublié ou compte bloqué ? Contactez le gestionnaire de votre station ou l'équipe Tôligo.
            </EncadreInfo>
          </div>
        </div>

        <div className="connexion__pied">
          <Bouton type="submit" enCours={enCours}>
            Se connecter
          </Bouton>
        </div>
      </form>
    </div>
  );
}

/** Illustration de l'écran de connexion (ordinateur) : le camion et les colis. */
function SceneLivreur() {
  return (
    <div className="scene-livreur">
      <svg className="scene-livreur__decor" viewBox="0 0 350 356" preserveAspectRatio="none">
        <circle cx="236" cy="118" r="98" fill="#fff" />
        <path d="M70 150 C110 96 180 92 214 140" stroke="#E86A2A" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray="2 9" />
        <path d="M0 300 C90 282 220 292 350 276 L350 356 L0 356 Z" fill="#EAEAEC" />
      </svg>
      <img src="/illustrations/colis-moyen.png" alt="" style={{ top: '17%', right: '19%', width: '27%' }} />
      <img src="/illustrations/colis-petit.png" alt="" style={{ top: '30%', right: '6%', width: '17%' }} />
      <img src="/illustrations/camion.png" alt="" style={{ left: '3%', bottom: '7%', width: '68%' }} />
      <span className="scene-livreur__puce" style={{ top: '9.6%', left: '6.3%' }}>
        <span className="scene-livreur__icone">
          <Truck size={14} />
        </span>
        Ramassage des box
      </span>
      <span className="scene-livreur__puce scene-livreur__puce--sombre" style={{ top: '21.3%', left: '6.3%' }}>
        <span className="scene-livreur__icone">
          <House size={14} />
        </span>
        Livraison à domicile
      </span>
    </div>
  );
}
