import { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from 'react';
import { Transaction, Account, Currency, isAccountProtected, Category, Goal, Debt, Subscription } from './types';
import { db, collection, addDoc, onSnapshot, query, deleteDoc, doc, updateDoc, setDoc, where, auth, writeBatch } from './firebase';
import { User, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { DEFAULT_CATEGORIES } from './categories';
import { aggregateUnifiedDebts } from './lib/debtUtils';

const getAuthTelegramUrl = () => {
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'myfinancetracker-9eb06';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://localhost:5001/${projectId}/us-central1/authTelegram`;
  }
  return `https://us-central1-${projectId}.cloudfunctions.net/authTelegram`;
};

interface StoreState {
  currentUser: User | null;
  transactions: Transaction[];
  accounts: Account[];
  addTransaction: (t: Omit<Transaction, 'id'>) => Promise<void>;
  importTransactionsBatch: (items: Omit<Transaction, 'id'>[]) => Promise<number>;
  updateTransaction: (id: string, t: Partial<Omit<Transaction, 'id'>>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addAccount: (name: string, currency: Currency) => Promise<void>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  categories: Category[];
  addCategory: (c: Omit<Category, 'id'>) => Promise<void>;
  updateCategory: (id: string, c: Partial<Omit<Category, 'id'>>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  goals: Goal[];
  addGoal: (g: Omit<Goal, 'id'>) => Promise<void>;
  updateGoal: (id: string, g: Partial<Omit<Goal, 'id'>>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  debts: Debt[];
  addDebt: (d: Omit<Debt, 'id'>) => Promise<void>;
  updateDebt: (id: string, d: Partial<Omit<Debt, 'id'>>) => Promise<void>;
  deleteDebt: (id: string) => Promise<void>;
  subscriptions: Subscription[];
  addSubscription: (s: Omit<Subscription, 'id'>) => Promise<void>;
  updateSubscription: (id: string, s: Partial<Omit<Subscription, 'id'>>) => Promise<void>;
  deleteSubscription: (id: string) => Promise<void>;
  loading: boolean;
  authChecked: boolean;
}

const StoreContext = createContext<StoreState | undefined>(undefined);

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dbAccounts, setDbAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [dbDebts, setDbDebts] = useState<Debt[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  // Monitor Telegram WebApp authentication
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg && tg.initData) {
      console.log("Telegram WebApp detected. Starting automatic custom token login...");
      
      // Expand WebApp viewport automatically
      tg.expand();
      
      const authenticateTelegram = async () => {
        try {
          const url = getAuthTelegramUrl();
          const timezoneOffset = new Date().getTimezoneOffset();
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: { initData: tg.initData, timezoneOffset } })
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const resJson = await response.json();
          if (resJson.error) {
            throw new Error(resJson.error.message || "Failed to authenticate via Telegram");
          }
          
          const customToken = resJson.result?.customToken;
          if (customToken) {
            await signInWithCustomToken(auth, customToken);
            console.log("Logged in successfully via Telegram Custom Token");
          }
        } catch (error) {
          console.error("Telegram Auth failed:", error);
        }
      };
      
      authenticateTelegram();
    }
  }, []);

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthChecked(true);
      if (!user) {
        setTransactions([]);
        setDbAccounts([]);
        setCategories([]);
        setGoals([]);
        setDbDebts([]);
        setSubscriptions([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to real-time updates from Firestore for transactions
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'transactions'), where('userId', '==', currentUser.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dbTransactions: Transaction[] = [];
      snapshot.forEach((d) => {
        dbTransactions.push({ id: d.id, ...d.data() } as Transaction);
      });

      // Сортировка по дате спусканием (вместо Firestore orderBy, чтобы не требовать создания индекса)
      dbTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setTransactions(dbTransactions);
      setLoading(false);
    }, (error) => {
      console.error("Firestore Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Subscribe to custom accounts
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'accounts'), where('userId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedAccounts: Account[] = [];
      snapshot.forEach((d) => {
        fetchedAccounts.push({ id: d.id, balanceUZS: 0, balanceUSD: 0, ...d.data() } as Account);
      });
      setDbAccounts(fetchedAccounts);
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Subscribe to categories and seed if empty or missing defaults
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'categories'), where('userId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const dbCategories: Category[] = [];
      snapshot.forEach(d => {
        dbCategories.push({ id: d.id, ...d.data() } as Category);
      });

      if (snapshot.empty) {
        console.log("Seeding default categories for user:", currentUser.uid);
        try {
          const promises = DEFAULT_CATEGORIES.map(c => {
            const { id, ...rest } = c;
            return setDoc(doc(db, 'categories', id), { ...rest, userId: currentUser.uid });
          });
          await Promise.all(promises);
        } catch (e) {
          console.error('Failed to seed categories', e);
          setCategories(DEFAULT_CATEGORIES.map(c => ({ ...c, userId: currentUser.uid })));
        }
        return;
      }

      // Deduplicate categories by name + type to guarantee UI never shows duplicates
      const seen = new Set<string>();
      const uniqueCats = dbCategories.filter(c => {
        const key = `${c.name.trim().toLowerCase()}_${c.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setCategories(uniqueCats);

      // Check if any DEFAULT_CATEGORIES are missing
      const existingIds = new Set(dbCategories.map(c => c.id));
      const missingDefaults = DEFAULT_CATEGORIES.filter(c =>
        !existingIds.has(c.id) &&
        !existingIds.has(`${currentUser.uid}_${c.id}`) &&
        !dbCategories.some(dbCat => dbCat.name.trim().toLowerCase() === c.name.trim().toLowerCase() && dbCat.type === c.type)
      );
      if (missingDefaults.length > 0) {
        console.log(`Re-seeding ${missingDefaults.length} missing default categories...`);
        try {
          const promises = missingDefaults.map(c => {
            const { id, ...rest } = c;
            return setDoc(doc(db, 'categories', id), { ...rest, userId: currentUser.uid });
          });
          await Promise.all(promises);
        } catch (e) {
          console.error('Failed to re-seed missing categories', e);
        }
      }
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Subscribe to goals
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'goals'), where('userId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Goal[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as Goal));
      setGoals(list);
    }, (err) => console.warn("Goals subscription error:", err));
    return () => unsubscribe();
  }, [currentUser]);

  // Subscribe to debts
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'debts'), where('userId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Debt[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as Debt));
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setDbDebts(list);
    }, (err) => console.warn("Debts subscription error:", err));
    return () => unsubscribe();
  }, [currentUser]);

  // Subscribe to recurring subscriptions
  useEffect(() => {
    if (!currentUser) return;
    const q = query(collection(db, 'subscriptions'), where('userId', '==', currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Subscription[] = [];
      snapshot.forEach(d => list.push({ id: d.id, ...d.data() } as Subscription));
      list.sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
      setSubscriptions(list);
    }, (err) => console.warn("Subscriptions error:", err));
    return () => unsubscribe();
  }, [currentUser]);

  // Dynamically aggregate unified debts from explicit dbDebts and debt-categorized transactions
  const debts = useMemo(() => {
    return aggregateUnifiedDebts(dbDebts, transactions, categories);
  }, [dbDebts, transactions, categories]);

  // Calculate generic balances locally in O(N + M) without extra render pass
  const accounts = useMemo(() => {
    const accountMap = new Map<string, Account>();
    const newAccounts = dbAccounts.map(acc => {
      const copy = { ...acc, balanceUZS: 0, balanceUSD: 0 };
      accountMap.set(copy.id, copy);
      return copy;
    });

    for (const t of transactions) {
      if (t.type === 'transfer') {
        const fromAcc = accountMap.get(t.accountId);
        const toAcc = t.toAccountId ? accountMap.get(t.toAccountId) : undefined;

        if (fromAcc) {
          if (t.currency === 'UZS') fromAcc.balanceUZS -= t.amount;
          else fromAcc.balanceUSD -= t.amount;
        }
        if (toAcc) {
          const receivedAmt = t.convertedAmount || t.amount;
          const toCurrency = toAcc.currency || 'UZS';
          if (toCurrency === 'UZS') toAcc.balanceUZS += receivedAmt;
          else toAcc.balanceUSD += receivedAmt;
        }
      } else {
        const acc = accountMap.get(t.accountId);
        if (!acc) continue;

        const amount = t.type === 'income' ? t.amount : -t.amount;

        if (t.currency === 'UZS') {
          acc.balanceUZS += amount;
        } else {
          acc.balanceUSD += amount;
        }
      }
    }

    return newAccounts;
  }, [transactions, dbAccounts]);

  const addTransaction = useCallback(async (t: Omit<Transaction, 'id'>) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'transactions'), { ...t, userId: currentUser.uid });
    } catch (e) {
      console.error("Error adding document: ", e);
    }
  }, [currentUser]);

  const importTransactionsBatch = useCallback(async (items: Omit<Transaction, 'id'>[]): Promise<number> => {
    if (!currentUser || items.length === 0) return 0;
    let importedCount = 0;
    const CHUNK_SIZE = 400;
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      for (const item of chunk) {
        const newRef = doc(collection(db, 'transactions'));
        batch.set(newRef, { ...item, userId: currentUser.uid });
      }
      await batch.commit();
      importedCount += chunk.length;
    }
    return importedCount;
  }, [currentUser]);

  const updateTransaction = useCallback(async (id: string, t: Partial<Omit<Transaction, 'id'>>) => {
    if (!currentUser) return;
    const tx = transactions.find(tx => tx.id === id);
    if (!tx || tx.userId !== currentUser.uid) return;
    try {
      await updateDoc(doc(db, 'transactions', id), t);
    } catch (e) {
      console.error("Error updating document: ", e);
    }
  }, [currentUser, transactions]);

  const deleteTransaction = useCallback(async (id: string) => {
    if (!currentUser) return;
    const tx = transactions.find(tx => tx.id === id);
    if (!tx || tx.userId !== currentUser.uid) return;
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (e) {
      console.error("Error deleting document: ", e);
    }
  }, [currentUser, transactions]);

  const addAccount = useCallback(async (name: string, currency: Currency) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'accounts'), { name, currency, order: Date.now(), userId: currentUser.uid });
    } catch (e) {
      console.error("Error adding account: ", e);
    }
  }, [currentUser]);

  const updateAccount = useCallback(async (id: string, updates: Partial<Account>) => {
    if (!currentUser) return;
    const acc = accounts.find(a => a.id === id);
    if (!acc || acc.userId !== currentUser.uid) return;
    try {
      await updateDoc(doc(db, 'accounts', id), updates);
    } catch (e) {
      console.error("Error updating account: ", e);
    }
  }, [currentUser, accounts]);

  const deleteAccount = useCallback(async (id: string) => {
    if (!currentUser) return;
    const acc = accounts.find(a => a.id === id);
    if (!acc || acc.userId !== currentUser.uid) return;

    if (isAccountProtected(acc)) {
      alert("Этот счет системный и защищен от удаления!");
      return;
    }

    try {
      await deleteDoc(doc(db, 'accounts', id));
    } catch (e) {
      console.error("Error deleting account: ", e);
    }
  }, [currentUser, accounts]);

  const addCategory = useCallback(async (c: Omit<Category, 'id'>) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'categories'), { ...c, userId: currentUser.uid });
    } catch (e) {
      console.error("Error adding category: ", e);
    }
  }, [currentUser]);

  const updateCategory = useCallback(async (id: string, c: Partial<Omit<Category, 'id'>>) => {
    if (!currentUser) return;
    const cat = categories.find(ct => ct.id === id);
    if (!cat || cat.userId !== currentUser.uid) return;
    try {
      await updateDoc(doc(db, 'categories', id), c);
    } catch (e) {
      console.error("Error updating category: ", e);
    }
  }, [currentUser, categories]);

  const deleteCategory = useCallback(async (id: string) => {
    if (!currentUser) return;
    const cat = categories.find(ct => ct.id === id);
    if (!cat || cat.userId !== currentUser.uid) return;

    // Check for used transactions
    const isInUse = transactions.some(t => t.categoryId === id);
    if (isInUse) {
      alert("Эту категорию нельзя удалить, так как по ней уже есть транзакции!");
      return;
    }

    try {
      await deleteDoc(doc(db, 'categories', id));
    } catch (e) {
      console.error("Error deleting category: ", e);
    }
  }, [currentUser, categories, transactions]);

  const addGoal = useCallback(async (g: Omit<Goal, 'id'>) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'goals'), { ...g, userId: currentUser.uid });
    } catch (e) {
      console.error("Error adding goal: ", e);
    }
  }, [currentUser]);

  const updateGoal = useCallback(async (id: string, g: Partial<Omit<Goal, 'id'>>) => {
    if (!currentUser) return;
    const existing = goals.find(item => item.id === id);
    if (!existing || existing.userId !== currentUser.uid) return;
    try {
      await updateDoc(doc(db, 'goals', id), g);
    } catch (e) {
      console.error("Error updating goal: ", e);
    }
  }, [currentUser, goals]);

  const deleteGoal = useCallback(async (id: string) => {
    if (!currentUser) return;
    const existing = goals.find(item => item.id === id);
    if (!existing || existing.userId !== currentUser.uid) return;
    try {
      await deleteDoc(doc(db, 'goals', id));
    } catch (e) {
      console.error("Error deleting goal: ", e);
    }
  }, [currentUser, goals]);

  const addDebt = useCallback(async (d: Omit<Debt, 'id'>) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'debts'), { ...d, userId: currentUser.uid });
    } catch (e) {
      console.error("Error adding debt: ", e);
    }
  }, [currentUser]);

  const updateDebt = useCallback(async (id: string, d: Partial<Omit<Debt, 'id'>>) => {
    if (!currentUser) return;
    const existing = debts.find(item => item.id === id);
    if (!existing) return;
    try {
      if (id.startsWith('auto_')) {
        await addDoc(collection(db, 'debts'), {
          personName: existing.personName,
          type: existing.type,
          totalAmount: existing.totalAmount,
          paidAmount: existing.paidAmount,
          currency: existing.currency,
          dueDate: existing.dueDate || null,
          note: existing.note || null,
          isSettled: existing.isSettled || false,
          createdAt: existing.createdAt || new Date().toISOString(),
          ...d,
          userId: currentUser.uid,
        });
      } else {
        await updateDoc(doc(db, 'debts', id), d);
      }
    } catch (e) {
      console.error("Error updating debt: ", e);
    }
  }, [currentUser, debts]);

  const deleteDebt = useCallback(async (id: string) => {
    if (!currentUser) return;
    const existing = debts.find(item => item.id === id);
    if (!existing) return;
    try {
      if (!id.startsWith('auto_')) {
        await deleteDoc(doc(db, 'debts', id));
      } else if (existing.sourceTransactionId) {
        await deleteDoc(doc(db, 'transactions', existing.sourceTransactionId));
      }
    } catch (e) {
      console.error("Error deleting debt: ", e);
    }
  }, [currentUser, debts]);

  const addSubscription = useCallback(async (s: Omit<Subscription, 'id'>) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'subscriptions'), { ...s, userId: currentUser.uid });
    } catch (e) {
      console.error("Error adding subscription: ", e);
    }
  }, [currentUser]);

  const updateSubscription = useCallback(async (id: string, s: Partial<Omit<Subscription, 'id'>>) => {
    if (!currentUser) return;
    const existing = subscriptions.find(item => item.id === id);
    if (!existing || existing.userId !== currentUser.uid) return;
    try {
      await updateDoc(doc(db, 'subscriptions', id), s);
    } catch (e) {
      console.error("Error updating subscription: ", e);
    }
  }, [currentUser, subscriptions]);

  const deleteSubscription = useCallback(async (id: string) => {
    if (!currentUser) return;
    const existing = subscriptions.find(item => item.id === id);
    if (!existing || existing.userId !== currentUser.uid) return;
    try {
      await deleteDoc(doc(db, 'subscriptions', id));
    } catch (e) {
      console.error("Error deleting subscription: ", e);
    }
  }, [currentUser, subscriptions]);

  const contextValue = useMemo(() => ({
    currentUser,
    transactions, accounts, categories,
    addTransaction, importTransactionsBatch, updateTransaction, deleteTransaction,
    addAccount, updateAccount, deleteAccount,
    addCategory, updateCategory, deleteCategory,
    goals, addGoal, updateGoal, deleteGoal,
    debts, addDebt, updateDebt, deleteDebt,
    subscriptions, addSubscription, updateSubscription, deleteSubscription,
    loading, authChecked
  }), [
    currentUser,
    transactions, accounts, categories,
    addTransaction, importTransactionsBatch, updateTransaction, deleteTransaction,
    addAccount, updateAccount, deleteAccount,
    addCategory, updateCategory, deleteCategory,
    goals, addGoal, updateGoal, deleteGoal,
    debts, addDebt, updateDebt, deleteDebt,
    subscriptions, addSubscription, updateSubscription, deleteSubscription,
    loading, authChecked
  ]);

  return (
    <StoreContext.Provider value={contextValue}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be within StoreProvider");
  return context;
};

