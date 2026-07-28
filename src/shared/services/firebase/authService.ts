import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithCredential, 
  GoogleAuthProvider, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  User 
} from 'firebase/auth';
import { auth } from './config';

/**
 * Helper to turn raw Firebase Auth error codes into clean, human-readable UI instructions
 */
function formatAuthError(error: any): string {
  const code = error?.code || '';
  const message = error?.message || 'Authentication failed.';

  if (code === 'auth/configuration-not-found') {
    return 'Email/Password sign-in is disabled in your Firebase Console! Please go to Firebase > Authentication > Sign-in method and enable Email/Password.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email address already exists. Please select "Sign In" above instead.';
  }
  if (code === 'auth/invalid-email') {
    return 'The email address format appears to be invalid.';
  }
  if (code === 'auth/weak-password') {
    return 'Your password is too weak. Please use at least 6 characters with a combination of letters and numbers.';
  }
  if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Incorrect email address or password. Please check your credentials or register a new account.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many sign-in attempts. Please try again later for security purposes.';
  }

  return message.replace('Firebase: Error (', '').replace(').', '').replace('-', ' ');
}

/**
 * Authentication Service powered by Firebase Auth
 * Handles User Onboarding (Registration, Email Login, Google Sign-In, and Session Persistence)
 */
export const firebaseAuthService = {
  /**
   * Register a fresh user account with Email and Password
   */
  registerWithEmail: async (email: string, pass: string) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      return { user: userCredential.user, error: null };
    } catch (error: any) {
      console.log('Email Registration info:', error.code || error.message);
      return { user: null, error: formatAuthError(error) };
    }
  },

  /**
   * Login an existing user account with Email and Password
   */
  loginWithEmail: async (email: string, pass: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), pass);
      return { user: userCredential.user, error: null };
    } catch (error: any) {
      console.log('Email Login info:', error.code || error.message);
      return { user: null, error: formatAuthError(error) };
    }
  },

  /**
   * Authenticate with Firebase using a Google ID Token retrieved via OAuth
   */
  loginWithGoogleToken: async (idToken: string) => {
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const userCredential = await signInWithCredential(auth, credential);
      return { user: userCredential.user, error: null };
    } catch (error: any) {
      console.log('Google Auth sign-in info:', error.code || error.message);
      return { user: null, error: formatAuthError(error) };
    }
  },

  /**
   * Log out the currently active Firebase User
   */
  logout: async () => {
    try {
      await firebaseSignOut(auth);
      return { error: null };
    } catch (error: any) {
      console.log('Firebase Logout info:', error.message);
      return { error: error.message || 'Failed to log out.' };
    }
  },

  /**
   * Subscribe to real-time authentication state changes
   */
  subscribeToAuthChanges: (callback: (user: User | null) => void) => {
    return onAuthStateChanged(auth, (user) => {
      callback(user);
    });
  },

  /**
   * Get the currently logged-in user synchronous instance
   */
  getCurrentUser: () => {
    return auth.currentUser;
  },
};
