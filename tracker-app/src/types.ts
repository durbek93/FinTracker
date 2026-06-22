export type Currency = 'UZS' | 'USD';
export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  iconName: string;
  color: string;
  userId?: string;
  excludeFromStats?: boolean;
}

export interface Account {
  id: string;
  name: string;
  currency?: Currency;
  excludeFromTotal?: boolean;
  isProtected?: boolean;
  order?: number;
  balanceUZS: number;
  balanceUSD: number;
  initialBalanceUZS?: number; // Стартовый баланс UZS — не учитывается в статистике
  initialBalanceUSD?: number; // Стартовый баланс USD — не учитывается в статистике
  userId?: string;
}

export const isAccountProtected = (acc: Account): boolean => {
  // Protection is managed exclusively via the isProtected field.
  // Never hardcode card numbers or account names here — security audit fix.
  return acc.isProtected === true;
};

export interface Transaction {
  id: string;
  amount: number;
  currency: Currency;
  categoryId: string; // for transfer could be empty
  accountId: string;  // For transfers, this is the "From" account
  toAccountId?: string; // For transfers, this is the "To" account
  exchangeRate?: number; // Optional exchange rate for cross-currency transfers
  convertedAmount?: number; // Optional amount actually received in destination currency
  addToExpenses?: boolean; // For UZS→USD transfers: track as a currency purchase expense
  date: string; // ISO string
  type: TransactionType;
  excludeFromStats?: boolean;
  note?: string;
  userId?: string;
}
