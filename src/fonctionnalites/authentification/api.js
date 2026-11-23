import { api } from '../../api/client';
import { lireObjet } from '../../utils/lecture';
import { versProfil } from '../profil/api';

/**
 * Connexion du livreur (POST /livreur/login).
 *
 * Les comptes sont créés par l'administration Tôligo : pas d'inscription,
 * pas de code SMS, pas de mot de passe oublié en libre-service.
 */
export async function connecter(telephone, motDePasse) {
  const donnees = lireObjet(await api.post('/livreur/login', { telephone, password: motDePasse }));
  return { jeton: donnees.token, profil: versProfil(lireObjet(donnees.livreur)) };
}
