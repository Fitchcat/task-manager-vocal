import { GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { auth } from './firebase';

const provider = new GoogleAuthProvider();
// Demander l'accès en lecture et écriture au calendrier Google
provider.addScope('https://www.googleapis.com/auth/calendar');


export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    
    // Obtenir le token d'accès Google (nécessaire pour appeler l'API Google Calendar)
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    
    // On sauvegarde le token pour pouvoir lire/écrire dans l'agenda plus tard
    if (token) {
      localStorage.setItem('google_calendar_token', token);
    }
    
    return result.user;
  } catch (error: any) {
    console.error("Erreur d'authentification :", error);
    alert("Erreur de connexion : " + error.message);
    throw error;
  }
};

export const logout = async () => {
  try {
    await signOut(auth);
    localStorage.removeItem('google_calendar_token');
  } catch (error) {
    console.error("Erreur de déconnexion :", error);
    throw error;
  }
};
