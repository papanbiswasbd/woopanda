import { doc, setDoc, getDocs, collection, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './config';
import { AuthCredentials } from '../secureStore';

export interface CloudStoreProfile extends AuthCredentials {
  storeId: string;
  storeName?: string;
  updatedAt?: any;
}

/**
 * Cloud Store Synchronization Service powered by Firestore
 * Enables multi-device automatic store access without requiring re-entry of WooCommerce API credentials
 */
export const storeCloudService = {
  /**
   * Securely sync a connected WooCommerce store's credentials under the authenticated Firebase user profile
   */
  saveStoreToCloud: async (userId: string, creds: AuthCredentials) => {
    if (!userId || !creds.siteUrl) return false;

    try {
      // Create a stable document ID from the site URL domain
      const storeId = creds.siteUrl
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/^_+|_+$/g, '');

      const docRef = doc(db, 'users', userId, 'stores', storeId || 'primary_store');
      
      const storeProfile: any = {
        ...creds,
        storeId,
        updatedAt: serverTimestamp(),
      };

      await setDoc(docRef, storeProfile, { merge: true });
      console.log(`Successfully synced store [${creds.siteUrl}] to Firestore under user profile [${userId}]`);
      return true;
    } catch (error: any) {
      console.error('Failed to sync store to Firestore cloud:', error);
      return false;
    }
  },

  /**
   * Fetch all saved WooCommerce stores tied to the user's cloud account when logging into a new device
   */
  fetchUserStoresFromCloud: async (userId: string): Promise<CloudStoreProfile[]> => {
    if (!userId) return [];

    try {
      const storesRef = collection(db, 'users', userId, 'stores');
      const snapshot = await getDocs(storesRef);

      const stores: CloudStoreProfile[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as CloudStoreProfile;
        stores.push({
          ...data,
          storeId: docSnap.id,
        });
      });

      console.log(`Recovered ${stores.length} store profile(s) from cloud for user [${userId}]`);
      return stores;
    } catch (error) {
      console.error('Error fetching user stores from Firestore:', error);
      return [];
    }
  },

  /**
   * Remove a connected store profile from cloud storage upon store disconnection
   */
  removeStoreFromCloud: async (userId: string, storeId: string) => {
    if (!userId || !storeId) return;
    try {
      await deleteDoc(doc(db, 'users', userId, 'stores', storeId));
      console.log(`Removed store [${storeId}] from cloud storage.`);
    } catch (error) {
      console.error('Failed to delete cloud store document:', error);
    }
  },
};
