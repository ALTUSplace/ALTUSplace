import React, { createContext, useContext, useState } from 'react';
import { readBrandPreference, writeBrandPreference } from '@/config/brand';

export type Currency = 'MAD' | 'EUR' | 'USD';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => void;
  formatPrice: (amountInMAD: number) => string;
  convertPrice: (amountInMAD: number) => number;
  symbol: string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

// Exchange rates relative to MAD (1 MAD)
const RATES = {
  MAD: 1,
  EUR: 0.092, // ~1 EUR = 10.8 MAD
  USD: 0.10,  // ~1 USD = 10 MAD
};

const SYMBOLS = {
  MAD: 'درهم',
  EUR: '€',
  USD: '$',
};

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const saved = readBrandPreference("currency");
    return saved === 'EUR' || saved === 'USD' ? saved : 'MAD';
  });

  const setCurrency = (c: Currency) => {
    setCurrencyState(c);
    writeBrandPreference("currency", c);
  };

  const convertPrice = (amountInMAD: number) => {
    const rate = RATES[currency] || 1;
    return Math.round(amountInMAD * rate);
  };

  const formatPrice = (amountInMAD: number) => {
    const converted = convertPrice(amountInMAD);
    const sym = SYMBOLS[currency];
    if (currency === 'MAD') {
      return `${converted.toLocaleString()} ${sym}`;
    } else {
      return `${sym}${converted.toLocaleString()}`;
    }
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatPrice, convertPrice, symbol: SYMBOLS[currency] }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
