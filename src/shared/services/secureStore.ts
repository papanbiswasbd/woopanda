import * as SecureStore from 'expo-secure-store';

const KEYS = {
  SITE_URL: 'wp_site_url',
  AUTH_METHOD: 'wp_auth_method',
  CONSUMER_KEY: 'wc_consumer_key',
  CONSUMER_SECRET: 'wc_consumer_secret',
  JWT_TOKEN: 'wp_jwt_token',
  USERNAME: 'wp_username',
  PASSWORD: 'wp_password',
};

export interface AuthCredentials {
  siteUrl?: string;
  authMethod?: 'keys' | 'jwt' | 'app_password';
  consumerKey?: string;
  consumerSecret?: string;
  jwtToken?: string;
  username?: string;
  password?: string;
}

export const secureStoreService = {
  async saveCredentials(creds: AuthCredentials): Promise<void> {
    try {
      if (creds.siteUrl) await SecureStore.setItemAsync(KEYS.SITE_URL, creds.siteUrl);
      if (creds.authMethod) await SecureStore.setItemAsync(KEYS.AUTH_METHOD, creds.authMethod);
      if (creds.consumerKey) await SecureStore.setItemAsync(KEYS.CONSUMER_KEY, creds.consumerKey);
      if (creds.consumerSecret) await SecureStore.setItemAsync(KEYS.CONSUMER_SECRET, creds.consumerSecret);
      if (creds.jwtToken) await SecureStore.setItemAsync(KEYS.JWT_TOKEN, creds.jwtToken);
      if (creds.username) await SecureStore.setItemAsync(KEYS.USERNAME, creds.username);
      if (creds.password) await SecureStore.setItemAsync(KEYS.PASSWORD, creds.password);
    } catch (error) {
      console.error('Error saving credentials to SecureStore:', error);
      throw error;
    }
  },

  async loadCredentials(): Promise<AuthCredentials> {
    try {
      const siteUrl = (await SecureStore.getItemAsync(KEYS.SITE_URL)) || undefined;
      const authMethod = (await SecureStore.getItemAsync(KEYS.AUTH_METHOD)) as 'keys' | 'jwt' | 'app_password' | null || undefined;
      const consumerKey = (await SecureStore.getItemAsync(KEYS.CONSUMER_KEY)) || undefined;
      const consumerSecret = (await SecureStore.getItemAsync(KEYS.CONSUMER_SECRET)) || undefined;
      const jwtToken = (await SecureStore.getItemAsync(KEYS.JWT_TOKEN)) || undefined;
      const username = (await SecureStore.getItemAsync(KEYS.USERNAME)) || undefined;
      const password = (await SecureStore.getItemAsync(KEYS.PASSWORD)) || undefined;

      return {
        siteUrl,
        authMethod,
        consumerKey,
        consumerSecret,
        jwtToken,
        username,
        password,
      };
    } catch (error) {
      console.error('Error loading credentials from SecureStore:', error);
      return {};
    }
  },

  async clearCredentials(): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(KEYS.SITE_URL);
      await SecureStore.deleteItemAsync(KEYS.AUTH_METHOD);
      await SecureStore.deleteItemAsync(KEYS.CONSUMER_KEY);
      await SecureStore.deleteItemAsync(KEYS.CONSUMER_SECRET);
      await SecureStore.deleteItemAsync(KEYS.JWT_TOKEN);
      await SecureStore.deleteItemAsync(KEYS.USERNAME);
      await SecureStore.deleteItemAsync(KEYS.PASSWORD);
    } catch (error) {
      console.error('Error deleting credentials from SecureStore:', error);
    }
  },
};
