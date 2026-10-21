import { Transaction, Category, Debt, DebtType, Currency } from '../types';

export type DebtCategoryRole = 'lent' | 'debt_repaid' | 'borrowed' | 'repaid_by_me';

/**
 * Determines the role of a category in the debt system.
 * 1. lent: Expense — I lent money (someone owes me)
 * 2. debt_repaid: Income — Someone repaid a debt to me (closing a lent debt)
 * 3. borrowed: Income — I borrowed money (I owe someone)
 * 4. repaid_by_me: Expense — I repaid my debt (closing a borrowed debt)
 */
export const getDebtCategoryRole = (name?: string, type?: string): DebtCategoryRole | null => {
  if (!name) return null;
  const norm = name.trim().toLowerCase();

  // 1. Одолжил (Расход: Я дал в долг -> мне должны вернуть)
  if (norm === 'одолжил' || norm.startsWith('одолжил')) {
    return 'lent';
  }

  // 2. Вернули долг (Доход: Мне вернули долг -> погашение того, что мне должны)
  if (
    norm.includes('вернули долг') ||
    (norm.includes('возврат') && norm.includes('долг') && type === 'income') ||
    (norm === 'долг закрыт' && type === 'income')
  ) {
    return 'debt_repaid';
  }

  // 3. Долг нужно вернуть (Доход: Я взял в долг -> я должен вернуть)
  if (
    norm.includes('долг нужно вернуть') ||
    (norm.includes('взял') && norm.includes('долг')) ||
    (norm === 'долг' && type === 'income')
  ) {
    return 'borrowed';
  }

  // 4. Вернул долг (я) (Расход: Я возвращаю взятый долг -> погашение моего долга)
  if (
    norm.includes('вернул долг') ||
    norm.includes('отдал долг') ||
    (norm.includes('погашение долга') && type === 'expense')
  ) {
    return 'repaid_by_me';
  }

  return null;
};

/**
 * Clean person name from transaction note.
 * Removes common prefixes and handles parentheses.
 */
export const extractPersonNameFromNote = (note?: string): string => {
  if (!note || !note.trim()) return 'Без имени';
  let clean = note.trim();

  // Strip prefixes like "Дал в долг: ", "Взял в долг: ", "Возврат долга от: ", "Погашение долга: "
  clean = clean.replace(
    /^(дал в долг|взял в долг|возврат долга от|возврат долга|погашение долга|вернуть долг|одолжил|долг)\s*[:\-—]?\s*/i,
    ''
  );

  // If there are parentheses at the end with additional comments, e.g. "Алишер (до 1 ноября)", extract "Алишер"
  const parenMatch = clean.match(/^([^(]+)\s*\([^)]*\)$/);
  if (parenMatch && parenMatch[1].trim()) {
    clean = parenMatch[1].trim();
  }

  // Remove hashtags like #долг
  clean = clean.replace(/#[a-zA-Zа-яА-Я0-9_]+/g, '').trim();

  return clean || 'Без имени';
};

/**
 * Find category matching a debt role among available categories.
 */
export const findDebtCategory = (categories: Category[], role: DebtCategoryRole): Category | undefined => {
  return categories.find(c => getDebtCategoryRole(c.name, c.type) === role);
};

/**
 * Reactive aggregation of unified debts:
 * Merges explicit Firestore `debts` with all transactions categorized as:
 * - «Одолжил»
 * - «Вернули долг»
 * - «Долг нужно вернуть»
 * - «Вернул долг (я)»
 */
export const aggregateUnifiedDebts = (
  dbDebts: Debt[],
  transactions: Transaction[],
  categories: Category[]
): Debt[] => {
  // Build lookup of category ID to role
  const catRoleMap = new Map<string, DebtCategoryRole>();
  for (const c of categories) {
    const role = getDebtCategoryRole(c.name, c.type);
    if (role) catRoleMap.set(c.id, role);
  }

  // 1. Clone explicit Firestore debts into map
  const debtsMap = new Map<string, Debt>();
  for (const d of dbDebts) {
    debtsMap.set(d.id, { ...d });
  }

  // 2. Identify debt-related transactions
  interface DebtTxItem {
    tx: Transaction;
    role: DebtCategoryRole;
    personName: string;
    currency: Currency;
  }

  const initialTxs: DebtTxItem[] = [];
  const repayTxs: DebtTxItem[] = [];

  for (const t of transactions) {
    const role = catRoleMap.get(t.categoryId);
    if (!role) continue;
    const personName = extractPersonNameFromNote(t.note);
    const item: DebtTxItem = {
      tx: t,
      role,
      personName,
      currency: t.currency || 'UZS',
    };
    if (role === 'lent' || role === 'borrowed') {
      initialTxs.push(item);
    } else if (role === 'debt_repaid' || role === 'repaid_by_me') {
      repayTxs.push(item);
    }
  }

  const makeKey = (personName: string, type: DebtType, currency: Currency) =>
    `${personName.trim().toLowerCase()}__${type}__${currency}`;

  // Index dbDebts by person key
  const dbDebtsByKey = new Map<string, Debt>();
  for (const d of debtsMap.values()) {
    const key = makeKey(d.personName, d.type, d.currency);
    dbDebtsByKey.set(key, d);
  }

  // Group initial transactions that are not already tracked in dbDebts
  const autoDebtsGroup = new Map<
    string,
    {
      personName: string;
      type: DebtType;
      currency: Currency;
      totalAmount: number;
      earliestDate: string;
      notes: string[];
      sourceTxIds: string[];
    }
  >();

  for (const item of initialTxs) {
    const type: DebtType = item.role === 'lent' ? 'lent' : 'borrowed';
    const key = makeKey(item.personName, type, item.currency);

    // If already in dbDebts, skip creating dynamic duplicate
    if (dbDebtsByKey.has(key)) {
      continue;
    }

    const existing = autoDebtsGroup.get(key);
    if (existing) {
      existing.totalAmount += item.tx.amount;
      if (new Date(item.tx.date) < new Date(existing.earliestDate)) {
        existing.earliestDate = item.tx.date;
      }
      if (item.tx.note && !existing.notes.includes(item.tx.note)) {
        existing.notes.push(item.tx.note);
      }
      existing.sourceTxIds.push(item.tx.id);
    } else {
      autoDebtsGroup.set(key, {
        personName: item.personName,
        type,
        currency: item.currency,
        totalAmount: item.tx.amount,
        earliestDate: item.tx.date,
        notes: item.tx.note ? [item.tx.note] : [],
        sourceTxIds: [item.tx.id],
      });
    }
  }

  // Convert autoDebtsGroup to dynamic Debt records
  for (const [key, group] of autoDebtsGroup.entries()) {
    const autoId = `auto_${group.type}_${encodeURIComponent(group.personName)}_${group.currency}`;
    const autoDebt: Debt = {
      id: autoId,
      personName: group.personName,
      type: group.type,
      totalAmount: group.totalAmount,
      paidAmount: 0,
      currency: group.currency,
      createdAt: group.earliestDate,
      note: group.notes.join('; ') || undefined,
      isSettled: false,
      isAutoParsed: true,
      sourceTransactionId: group.sourceTxIds[0],
    };
    debtsMap.set(autoId, autoDebt);
    dbDebtsByKey.set(key, autoDebt);
  }

  // 3. Apply repayments
  for (const item of repayTxs) {
    const targetType: DebtType = item.role === 'debt_repaid' ? 'lent' : 'borrowed';

    // A. Match by explicit debtId on transaction
    if (item.tx.debtId && debtsMap.has(item.tx.debtId)) {
      const targetDebt = debtsMap.get(item.tx.debtId)!;
      targetDebt.paidAmount += item.tx.amount;
      continue;
    }

    // B. Match by personName + targetType + currency
    const key = makeKey(item.personName, targetType, item.currency);
    const targetDebt = dbDebtsByKey.get(key);
    if (targetDebt) {
      targetDebt.paidAmount += item.tx.amount;
    }
  }

  // 4. Finalize isSettled status for all debts
  const result: Debt[] = [];
  for (const d of debtsMap.values()) {
    const paid = d.paidAmount || 0;
    const isSettled = paid >= d.totalAmount;
    result.push({
      ...d,
      paidAmount: paid,
      isSettled: d.isSettled ?? isSettled,
    });
  }

  // Sort: unsettled first, then newest first
  return result.sort((a, b) => {
    if (a.isSettled !== b.isSettled) {
      return a.isSettled ? 1 : -1;
    }
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
};
