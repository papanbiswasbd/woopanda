import { create } from 'zustand';
import { secureStoreService, AuthCredentials } from '../services/secureStore';
import { User } from 'firebase/auth';
import { storeCloudService } from '../services/firebase/storeCloudService';
import { firebaseAuthService } from '../services/firebase/authService';

interface AuthState {
  firebaseUser: User | null;
  isUserLoggedIn: boolean;
  isStoreConnected: boolean;
  isAuthenticated: boolean; // True when both user account and WooCommerce store are active
  credentials: AuthCredentials | null;
  isLoading: boolean;
  
  setFirebaseUser: (user: User | null) => Promise<void>;
  setCredentials: (creds: AuthCredentials, syncToCloud?: boolean) => Promise<void>;
  loadStoredCredentials: () => Promise<void>;
  disconnectStore: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  firebaseUser: null,
  isUserLoggedIn: false,
  isStoreConnected: false,
  isAuthenticated: false,
  credentials: null,
  isLoading: true,

  setFirebaseUser: async (user: User | null) => {
    const { credentials } = get();
    const isUserLoggedIn = !!user;
    let currentCreds = credentials;
    let isStoreConnected = !!(currentCreds && currentCreds.siteUrl);

    if (isUserLoggedIn && user && !isStoreConnected) {
      // Automatic Multi-Device Recovery: Check if user already connected a WooCommerce store in Firestore cloud!
      try {
        const cloudStores = await storeCloudService.fetchUserStoresFromCloud(user.uid);
        if (cloudStores.length > 0) {
          const primaryStore = cloudStores[0];
          console.log('Auto-recovering cloud WooCommerce store for user on this device:', primaryStore.siteUrl);
          await secureStoreService.saveCredentials(primaryStore);
          currentCreds = primaryStore;
          isStoreConnected = true;
        }
      } catch (err) {
        console.error('Error auto-recovering cloud store profile:', err);
      }
    }

    set({
      firebaseUser: user,
      isUserLoggedIn,
      credentials: currentCreds,
      isStoreConnected,
      isAuthenticated: isUserLoggedIn && isStoreConnected,
      isLoading: false,
    });
  },

  setCredentials: async (creds: AuthCredentials, syncToCloud = true) => {
    set({ isLoading: true });
    try {
      await secureStoreService.saveCredentials(creds);
      
      const hasValidCreds = !!creds.siteUrl && (
        (creds.authMethod === 'keys' && !!creds.consumerKey && !!creds.consumerSecret) ||
        (creds.authMethod === 'jwt' && !!creds.jwtToken) ||
        (creds.authMethod === 'app_password' && !!creds.username && !!creds.password)
      );

      const { firebaseUser, isUserLoggedIn } = get();

      // Automatically persist credentials to Firebase Firestore so user won't need to enter them on other devices!
      if (syncToCloud && isUserLoggedIn && firebaseUser && hasValidCreds) {
        await storeCloudService.saveStoreToCloud(firebaseUser.uid, creds);
      }

      set({
        credentials: creds,
        isStoreConnected: hasValidCreds,
        isAuthenticated: isUserLoggedIn && hasValidCreds,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to save store credentials:', error);
      set({ isLoading: false });
      throw error;
    }
  },

  loadStoredCredentials: async () => {
    set({ isLoading: true });
    try {
      const creds = await secureStoreService.loadCredentials();
      const hasValidCreds = !!creds.siteUrl && (
        (creds.authMethod === 'keys' && !!creds.consumerKey && !!creds.consumerSecret) ||
        (creds.authMethod === 'jwt' && !!creds.jwtToken) ||
        (creds.authMethod === 'app_password' && !!creds.username && !!creds.password)
      );

      const currentUser = firebaseAuthService.getCurrentUser();
      const isUserLoggedIn = !!currentUser;

      set({
        credentials: hasValidCreds ? creds : null,
        firebaseUser: currentUser || null,
        isUserLoggedIn,
        isStoreConnected: hasValidCreds,
        isAuthenticated: isUserLoggedIn && hasValidCreds,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to load stored credentials:', error);
      set({ credentials: null, isStoreConnected: false, isAuthenticated: false, isLoading: false });
    }
  },

  disconnectStore: async () => {
    set({ isLoading: true });
    try {
      const { firebaseUser, credentials } = get();
      if (firebaseUser && credentials?.siteUrl) {
        const storeId = credentials.siteUrl.toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '');
        await storeCloudService.removeStoreFromCloud(firebaseUser.uid, storeId);
      }
      await secureStoreService.clearCredentials();
      set({ credentials: null, isStoreConnected: false, isAuthenticated: false, isLoading: false });
    } catch (error) {
      console.error('Failed to disconnect store:', error);
      set({ isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await firebaseAuthService.logout();
      await secureStoreService.clearCredentials();
      set({ 
        firebaseUser: null,
        isUserLoggedIn: false,
        credentials: null, 
        isStoreConnected: false, 
        isAuthenticated: false, 
        isLoading: false 
      });
    } catch (error) {
      console.error('Failed to logout user and clear store:', error);
      set({ isLoading: false });
    }
  },
}));
