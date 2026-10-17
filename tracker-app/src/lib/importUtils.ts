import { Account, Category, Currency, Transaction, TransactionType } from '../types';

export interface ParsedImportRow {
  rowNumber: number;
  date: string; // ISO string
  type: TransactionType;
  amount: number;
  currency: Currency;
  categoryId: string;
  categoryName: string;
  accountId: string;
  accountName: string;
  note: string;
  tags: string[];
}

const normalizeHeader = (h: string): string =>
  h.trim().toLowerCase().replace(/ё/g, 'е');

const parseDateFlexible = (rawDate: unknown, rawTime?: unknown): string => {
  if (!rawDate) return new Date().toISOString();

  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    return rawDate.toISOString();
  }

  // Excel serial date number
  if (typeof rawDate === 'number' && rawDate > 25000 && rawDate < 80000) {
    const utcDays = Math.floor(rawDate - 25569);
    const utcValue = utcDays * 86400 * 1000;
    return new Date(utcValue).toISOString();
  }

  const str = String(rawDate).trim();
  const timeStr = rawTime ? String(rawTime).trim() : '12:00';

  // DD.MM.YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}:\d{2}))?/);
  if (dmyMatch) {
    const [, dd, mm, yyyy, inlineTime] = dmyMatch;
    const t = inlineTime || (timeStr.match(/^\d{1,2}:\d{2}/) ? timeStr : '12:00');
    const parsed = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${t.padStart(5, '0')}:00`);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }

  // YYYY-MM-DD
  const isoMatch = new Date(str);
  if (!isNaN(isoMatch.getTime())) {
    return isoMatch.toISOString();
  }

  return new Date().toISOString();
};

const parseAmountFlexible = (val: unknown): number => {
  if (typeof val === 'number') return Math.abs(val);
  if (!val) return 0;
  const cleaned = String(val)
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.abs(num);
};

export async function parseImportFile(
  file: File,
  categories: Category[],
  accounts: Account[]
): Promise<ParsedImportRow[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
  if (rawRows.length === 0) return [];

  const defaultAccount = accounts[0];
  const defaultExpenseCat = categories.find(c => c.type === 'expense') || categories[0];
  const defaultIncomeCat = categories.find(c => c.type === 'income') || categories[0];

  const results: ParsedImportRow[] = [];

  rawRows.forEach((rawRow, idx) => {
    const normalizedMap: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawRow)) {
      normalizedMap[normalizeHeader(key)] = value;
    }

    const rawDate =
      normalizedMap['дата'] ??
      normalizedMap['date'] ??
      normalizedMap['дата операции'] ??
      normalizedMap['время операции'] ??
      '';
    const rawTime = normalizedMap['время'] ?? normalizedMap['time'] ?? '';

    const rawAmount =
      normalizedMap['сумма'] ??
      normalizedMap['amount'] ??
      normalizedMap['сумма операции'] ??
      normalizedMap['итого'] ??
      0;

    const amount = parseAmountFlexible(rawAmount);
    if (amount <= 0) return;

    // Detect type
    const rawType = String(
      normalizedMap['тип'] ??
      normalizedMap['type'] ??
      normalizedMap['вид'] ??
      ''
    ).toLowerCase();

    let type: TransactionType = 'expense';
    if (
      rawType.includes('доход') ||
      rawType.includes('income') ||
      rawType.includes('пополнение') ||
      rawType.includes('приход') ||
      String(rawAmount).trim().startsWith('+')
    ) {
      type = 'income';
    } else if (rawType.includes('перевод') || rawType.includes('transfer')) {
      type = 'transfer';
    }

    // Detect currency
    const rawCurrency = String(
      normalizedMap['валюта'] ??
      normalizedMap['currency'] ??
      normalizedMap['вал'] ??
      'UZS'
    ).toUpperCase();
    const currency: Currency = rawCurrency.includes('USD') || rawCurrency.includes('$') ? 'USD' : 'UZS';

    // Match category by name
    const rawCategory = String(
      normalizedMap['категория'] ??
      normalizedMap['category'] ??
      ''
    ).trim();

    let matchedCat = categories.find(
      c => c.name.toLowerCase() === rawCategory.toLowerCase() && (c.type === type || type === 'transfer')
    );
    if (!matchedCat && rawCategory) {
      matchedCat = categories.find(c => c.name.toLowerCase().includes(rawCategory.toLowerCase()));
    }
    if (!matchedCat) {
      matchedCat = type === 'income' ? defaultIncomeCat : defaultExpenseCat;
    }

    // Match account by name
    const rawAccount = String(
      normalizedMap['счет'] ??
      normalizedMap['счёт'] ??
      normalizedMap['account'] ??
      normalizedMap['карта'] ??
      ''
    ).trim();

    let matchedAcc = accounts.find(a => a.name.toLowerCase() === rawAccount.toLowerCase());
    if (!matchedAcc && rawAccount) {
      matchedAcc = accounts.find(a => a.name.toLowerCase().includes(rawAccount.toLowerCase()));
    }
    if (!matchedAcc) {
      matchedAcc = accounts.find(a => (a.currency || 'UZS') === currency) || defaultAccount;
    }

    const rawNote = String(
      normalizedMap['комментарий'] ??
      normalizedMap['описание'] ??
      normalizedMap['назначение'] ??
      normalizedMap['note'] ??
      normalizedMap['description'] ??
      ''
    ).trim();

    const rawTags = String(
      normalizedMap['теги'] ??
      normalizedMap['tags'] ??
      ''
    ).trim();

    const tags = rawTags
      ? rawTags
          .split(/[\s,;]+/)
          .map(t => t.replace(/^#+/, '').trim().toLowerCase())
          .filter(Boolean)
      : [];

    results.push({
      rowNumber: idx + 2,
      date: parseDateFlexible(rawDate, rawTime),
      type,
      amount,
      currency,
      categoryId: type === 'transfer' ? '' : (matchedCat?.id || ''),
      categoryName: type === 'transfer' ? 'Перевод' : (matchedCat?.name || 'Без категории'),
      accountId: matchedAcc?.id || '',
      accountName: matchedAcc?.name || 'Основной счёт',
      note: rawNote,
      tags,
    });
  });

  return results;
}

export function convertParsedRowsToTransactions(rows: ParsedImportRow[]): Omit<Transaction, 'id'>[] {
  return rows
    .filter(r => r.amount > 0 && r.accountId)
    .map(r => {
      const tx: Omit<Transaction, 'id'> = {
        amount: r.amount,
        currency: r.currency,
        categoryId: r.categoryId,
        accountId: r.accountId,
        date: r.date,
        type: r.type,
        note: r.note,
      };
      if (r.tags.length > 0) {
        tx.tags = r.tags;
      }
      return tx;
    });
}
