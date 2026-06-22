import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Transaction, Account, Currency, isAccountProtected, Category } from './types';
import { db, collection, addDoc, onSnapshot, query, deleteDoc, doc, updateDoc, setDoc, where, getDocs, auth } from './firebase';
import { User, onAuthStateChanged } from 'firebase/auth';
import { DEFAULT_CATEGORIES } from './categories';

interface StoreState {
  currentUser: User | null;
  transactions: Transaction[];
  accounts: Account[];
  addTransaction: (t: Omit<Transaction, 'id'>) => Promise<void>;
  updateTransaction: (id: string, t: Partial<Omit<Transaction, 'id'>>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  addAccount: (name: string, currency: Currency) => Promise<void>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  categories: Category[];
  addCategory: (c: Omit<Category, 'id'>) => Promise<void>;
  updateCategory: (id: string, c: Partial<Omit<Category, 'id'>>) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  loading: boolean;
  authChecked: boolean;
}

const StoreContext = createContext<StoreState | undefined>(undefined);

export const StoreProvider = ({ children }: { children: ReactNode }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dbAccounts, setDbAccounts] = useState<Account[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthChecked(true);
      if (!user) {
        setTransactions([]);
        setDbAccounts([]);
        setCategories([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Data Migration Script
  useEffect(() => {
    if (!currentUser) return;
    const migrate = async () => {
      try {
        const migrateCollection = async (collName: string) => {
          const snap = await getDocs(collection(db, collName));
          const promises: Promise<void>[] = [];
          snap.forEach((d: any) => {
            const data = d.data();
            if (!data.userId) {
              promises.push(updateDoc(doc(db, collName, d.id), { userId: currentUser.uid }));
            }
          });
          await Promise.all(promises);
        };
        await migrateCollection('transactions');
        await migrateCollection('accounts');
        await migrateCollection('categories');
      } catch (e) {
        console.error('Migration failed:', e);
      }
    };
    migrate();
  }, [currentUser]);

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
      // Always extract what we have and update state immediately
      const dbCategories: Category[] = [];
      snapshot.forEach(d => {
        dbCategories.push({ id: d.id, ...d.data() } as Category);
      });

      if (snapshot.empty) {
        // Collection empty for this user — seed all defaults
        console.log("Seeding default categories for user:", currentUser.uid);
        try {
          const promises = DEFAULT_CATEGORIES.map(c => {
            const { id, ...rest } = c;
            return setDoc(doc(db, 'categories', id), { ...rest, userId: currentUser.uid });
          });
          await Promise.all(promises);
          // onSnapshot will fire again automatically with the seeded data
        } catch (e) {
          console.error('Failed to seed categories', e);
          // Fallback: use defaults in memory so UI doesn't break
          setCategories(DEFAULT_CATEGORIES.map(c => ({ ...c, userId: currentUser.uid })));
        }
        return;
      }

      setCategories(dbCategories);

      // Check if any DEFAULT_CATEGORIES are missing (wrong userId or userId missing in Firestore)
      // This fixes the case where defaults exist in Firestore but with a different/missing userId
      const existingIds = new Set(dbCategories.map(c => c.id));
      const missingDefaults = DEFAULT_CATEGORIES.filter(c => !existingIds.has(c.id));
      if (missingDefaults.length > 0) {
        console.log(`Re-seeding ${missingDefaults.length} missing default categories...`);
        try {
          const promises = missingDefaults.map(c => {
            const { id, ...rest } = c;
            // setDoc will create or overwrite the doc with correct userId
            return setDoc(doc(db, 'categories', id), { ...rest, userId: currentUser.uid });
          });
          await Promise.all(promises);
          // onSnapshot will fire again with the complete list
        } catch (e) {
          console.error('Failed to re-seed missing categories', e);
          // Fallback: merge defaults into current categories in memory
          const merged = [...dbCategories];
          missingDefaults.forEach(c => merged.push({ ...c, userId: currentUser.uid }));
          setCategories(merged);
        }
      }
    });
    return () => unsubscribe();
  }, [currentUser]);

  // Calculate generic balances locally 
  useEffect(() => {
    const newAccounts = dbAccounts.map(acc => ({ ...acc }));

    transactions.forEach(t => {
      if (t.type === 'transfer') {
        const fromAcc = newAccounts.find(a => a.id === t.accountId);
        const toAcc = newAccounts.find(a => a.id === t.toAccountId);

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
        const acc = newAccounts.find(a => a.id === t.accountId);
        if (!acc) return;

        const amount = t.type === 'income' ? t.amount : -t.amount;

        if (t.currency === 'UZS') {
          acc.balanceUZS += amount;
        } else {
          acc.balanceUSD += amount;
        }
      }
    });

    setAccounts(newAccounts);
  }, [transactions, dbAccounts]);

  const addTransaction = async (t: Omit<Transaction, 'id'>) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'transactions'), { ...t, userId: currentUser.uid });
    } catch (e) {
      console.error("Error adding document: ", e);
    }
  };

  const updateTransaction = async (id: string, t: Partial<Omit<Transaction, 'id'>>) => {
    if (!currentUser) return;
    const tx = transactions.find(tx => tx.id === id);
    if (!tx || tx.userId !== currentUser.uid) return;
    try {
      await updateDoc(doc(db, 'transactions', id), t);
    } catch (e) {
      console.error("Error updating document: ", e);
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!currentUser) return;
    const tx = transactions.find(tx => tx.id === id);
    if (!tx || tx.userId !== currentUser.uid) return;
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (e) {
      console.error("Error deleting document: ", e);
    }
  };

  const addAccount = async (name: string, currency: Currency) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'accounts'), { name, currency, order: Date.now(), userId: currentUser.uid });
    } catch (e) {
      console.error("Error adding account: ", e);
    }
  };

  const updateAccount = async (id: string, updates: Partial<Account>) => {
    if (!currentUser) return;
    const acc = accounts.find(a => a.id === id);
    if (!acc || acc.userId !== currentUser.uid) return;
    try {
      await updateDoc(doc(db, 'accounts', id), updates);
    } catch (e) {
      console.error("Error updating account: ", e);
    }
  };

  const deleteAccount = async (id: string) => {
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
  };

  const addCategory = async (c: Omit<Category, 'id'>) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, 'categories'), { ...c, userId: currentUser.uid });
    } catch (e) {
      console.error("Error adding category: ", e);
    }
  };

  const updateCategory = async (id: string, c: Partial<Omit<Category, 'id'>>) => {
    if (!currentUser) return;
    const cat = categories.find(ct => ct.id === id);
    if (!cat || cat.userId !== currentUser.uid) return;
    try {
      await updateDoc(doc(db, 'categories', id), c);
    } catch (e) {
      console.error("Error updating category: ", e);
    }
  };

  const deleteCategory = async (id: string) => {
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
  };

  return (
    <StoreContext.Provider value={{
      currentUser,
      transactions, accounts, categories,
      addTransaction, updateTransaction, deleteTransaction,
      addAccount, updateAccount, deleteAccount,
      addCategory, updateCategory, deleteCategory,
      loading, authChecked
    }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be within StoreProvider");
  return context;
};
