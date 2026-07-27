import { create } from 'zustand';
import { secureStoreService, AuthCredentials } from '../services/secureStore';

interface AuthState {
  isAuthenticated: boolean;
  credentials: AuthCredentials | null;
  isLoading: boolean;
  setCredentials: (creds: AuthCredentials) => Promise<void>;
  loadStoredCredentials: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  credentials: null,
  isLoading: true,

  setCredentials: async (creds: AuthCredentials) => {
    set({ isLoading: true });
    try {
      await secureStoreService.saveCredentials(creds);
      set({
        credentials: creds,
        isAuthenticated: !!creds.siteUrl && (
          (creds.authMethod === 'keys' && !!creds.consumerKey && !!creds.consumerSecret) ||
          (creds.authMethod === 'jwt' && !!creds.jwtToken) ||
          (creds.authMethod === 'app_password' && !!creds.username && !!creds.password)
        ),
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to set credentials:', error);
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
      set({
        credentials: hasValidCreds ? creds : null,
        isAuthenticated: hasValidCreds,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to load stored credentials:', error);
      set({ credentials: null, isAuthenticated: false, isLoading: false });
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await secureStoreService.clearCredentials();
      set({ credentials: null, isAuthenticated: false, isLoading: false });
    } catch (error) {
      console.error('Failed to logout:', error);
      set({ isLoading: false });
    }
  },
}));
