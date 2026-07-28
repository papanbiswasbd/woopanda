import { create } from 'zustand';

export interface OrderNotificationPayload {
  id: number;
  number: string;
  customerName: string;
  total: string;
  currency: string;
  quantity: number;
  image?: string;
  timestamp: number;
}

interface SettingsState {
  darkMode: 'light' | 'dark' | 'system';
  currency: string;
  lowStockThreshold: number;
  orderStatuses: { label: string; value: string }[];
  setDarkMode: (mode: 'light' | 'dark' | 'system') => void;
  setCurrency: (currency: string) => void;
  setLowStockThreshold: (threshold: number) => void;
  setOrderStatuses: (statuses: { label: string; value: string }[]) => void;
  lastDatabaseUpdate: number;
  triggerDatabaseUpdate: () => void;
  defaultTimeRange: string;
  setDefaultTimeRange: (range: string) => void;
  newOrderNotification: OrderNotificationPayload | null;
  showNewOrderNotification: (payload: Omit<OrderNotificationPayload, 'timestamp'>) => void;
  clearNewOrderNotification: () => void;
}

const DEFAULT_STATUSES = [
  { label: 'Processing', value: 'processing' },
  { label: 'Completed', value: 'completed' },
  { label: 'Pending', value: 'pending' },
  { label: 'On Hold', value: 'on-hold' },
  { label: 'Cancelled', value: 'cancelled' },
];

export const useSettingsStore = create<SettingsState>((set) => ({
  darkMode: 'system',
  currency: 'USD',
  lowStockThreshold: 5,
  orderStatuses: DEFAULT_STATUSES,
  lastDatabaseUpdate: Date.now(),
  defaultTimeRange: 'all_data',
  newOrderNotification: null,

  setDarkMode: (mode) => set({ darkMode: mode }),
  setCurrency: (currency) => set({ currency }),
  setLowStockThreshold: (lowStockThreshold) => set({ lowStockThreshold }),
  setOrderStatuses: (orderStatuses) => set({ orderStatuses }),
  triggerDatabaseUpdate: () => set({ lastDatabaseUpdate: Date.now() }),
  setDefaultTimeRange: (defaultTimeRange) => set({ defaultTimeRange }),
  showNewOrderNotification: (payload) => set({ newOrderNotification: { ...payload, timestamp: Date.now() } }),
  clearNewOrderNotification: () => set({ newOrderNotification: null }),
}));

export const getCurrencySymbol = (currencyCode: string) => {
  const symbols: { [key: string]: string } = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    AUD: 'A$',
    CAD: 'C$',
    CHF: 'CHF',
    CNY: '¥',
    SEK: 'kr',
    NZD: 'NZ$',
    INR: '₹',
    BDT: '৳',
    RUB: '₽',
    BRL: 'R$',
    ZAR: 'R',
    TRY: '₺',
    PKR: '₨',
  };
  return symbols[(currencyCode || 'USD').toUpperCase()] || (currencyCode || '$');
};
