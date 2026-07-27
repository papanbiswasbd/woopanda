import { create } from 'zustand';

interface SettingsState {
  darkMode: 'light' | 'dark' | 'system';
  currency: string;
  lowStockThreshold: number;
  setDarkMode: (mode: 'light' | 'dark' | 'system') => void;
  setCurrency: (currency: string) => void;
  setLowStockThreshold: (threshold: number) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  darkMode: 'system',
  currency: 'USD',
  lowStockThreshold: 5,

  setDarkMode: (mode) => set({ darkMode: mode }),
  setCurrency: (currency) => set({ currency }),
  setLowStockThreshold: (lowStockThreshold) => set({ lowStockThreshold }),
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
