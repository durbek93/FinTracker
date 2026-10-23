import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { LayoutGrid, List as ListIcon, PieChart, Plus, Wallet, Eye, EyeOff, Settings, Loader2, Target, HandCoins, CalendarClock, Play } from 'lucide-react';
import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useStore } from './store';
import { getIcon } from './lib/icons';
import { format, startOfMonth, endOfMonth, differenceInCalendarDays, addWeeks, addMonths, addYears } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Subscription } from './types';
import { hasPinEnabled } from './lib/securityLock';
import './index.css';
import './App.css';

const AddTransaction = lazy(() => import('./pages/AddTransaction'));
const History = lazy(() => import('./pages/History'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Analytics = lazy(() => import('./pages/Analytics'));
const AccountDetails = lazy(() => import('./pages/AccountDetails'));
const Categories = lazy(() => import('./pages/Categories'));
const Planning = lazy(() => import('./pages/Planning'));
const Login = lazy(() => import('./pages/Login'));
const SettingsSidebar = lazy(() => import('./components/SettingsSidebar'));
const AppLockScreen = lazy(() => import('./components/AppLockScreen'));

const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60dvh' }}>
    <Loader2 size={32} className="animate-spin text-accent" style={{ color: 'var(--accent-primary)' }} />
  </div>
);

// Formatter function
const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('ru-RU').format(Math.round(amount)) + ' ' + currency;
};

const Dashboard = () => {
  const {
    accounts,
    transactions,
    categories,
    updateTransaction,
    goals,
    debts,
    subscriptions,
    addTransaction,
    updateSubscription,
  } = useStore();
  const [hideBalance, setHideBalance] = useState(() => localStorage.getItem('hideBalance') === 'true');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  useEffect(() => {
    localStorage.setItem('hideBalance', hideBalance.toString());
  }, [hideBalance]);

  const activeAccounts = accounts.filter(a => !a.excludeFromTotal);
  const totalBalanceUZS = activeAccounts.reduce((acc, a) => acc + (a.currency !== 'USD' ? a.balanceUZS : 0), 0);
  const totalBalanceUSD = activeAccounts.reduce((acc, a) => acc + (a.currency === 'USD' ? a.balanceUSD : 0), 0);

  // Get last 5 transactions
  const recentTransactions = transactions.slice(0, 5);

  // Upcoming or overdue subscriptions (within 3 days)
  const dueSubscriptions = useMemo(() => {
    const now = new Date();
    return subscriptions.filter(s => {
      if (!s.isActive) return false;
      const diff = differenceInCalendarDays(new Date(s.nextDueDate), now);
      return diff <= 3;
    });
  }, [subscriptions]);

  const handleQuickPaySubscription = async (sub: Subscription) => {
    const targetAccId = sub.accountId || accounts[0]?.id || '';
    if (!targetAccId) {
      alert('Сначала создайте счёт во вкладке «Счета»!');
      return;
    }
    await addTransaction({
      amount: sub.amount,
      currency: sub.currency,
      categoryId: sub.categoryId || categories.find(c => c.type === sub.type)?.id || '',
      accountId: targetAccId,
      date: new Date().toISOString(),
      type: sub.type,
      note: `Регулярный платёж: ${sub.name}`,
      tags: ['регулярный'],
    });
    const base = new Date(sub.nextDueDate);
    const validBase = isNaN(base.getTime()) ? new Date() : base;
    const next =
      sub.interval === 'weekly'
        ? addWeeks(validBase, 1)
        : sub.interval === 'yearly'
        ? addYears(validBase, 1)
        : addMonths(validBase, 1);
    await updateSubscription(sub.id, { nextDueDate: format(next, 'yyyy-MM-dd') });
  };

  // Calculate current month category budgets
  const budgetItems = useMemo(() => {
    const budgetedCats = categories.filter(c => c.type === 'expense' && (c.monthlyBudgetUZS || 0) > 0);
    if (budgetedCats.length === 0) return [];

    const excludedAccountIds = new Set(
      accounts
        .filter(a => a.excludeFromStats || a.name.trim().toLowerCase().includes('недостача'))
        .map(a => a.id)
    );

    const now = new Date();
    const mStart = startOfMonth(now);
    const mEnd = endOfMonth(now);

    const spentByCat: Record<string, number> = {};
    for (const t of transactions) {
      if (t.type !== 'expense' || t.excludeFromStats) continue;
      if (excludedAccountIds.has(t.accountId) || (t.toAccountId && excludedAccountIds.has(t.toAccountId))) continue;
      const d = new Date(t.date);
      if (d < mStart || d > mEnd) continue;
      const amtUZS = t.currency === 'UZS'
        ? t.amount
        : (t.convertedAmount ?? (t.exchangeRate ? t.amount * t.exchangeRate : 0));
      spentByCat[t.categoryId] = (spentByCat[t.categoryId] || 0) + amtUZS;
    }

    return budgetedCats
      .map(c => {
        const limit = c.monthlyBudgetUZS || 0;
        const spent = spentByCat[c.id] || 0;
        const pct = limit > 0 ? (spent / limit) * 100 : 0;
        return { category: c, limit, spent, pct };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [categories, transactions, accounts]);

  const activeDebtsCount = debts.filter(d => !d.isSettled).length;

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Главная</h2>
        <button onClick={() => setIsSettingsOpen(true)} style={{ color: 'var(--text-primary)' }}>
          <Settings size={24} />
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', background: 'var(--accent-primary)', opacity: '0.1', borderRadius: '50%', filter: 'blur(20px)', pointerEvents: 'none' }}></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', zIndex: 2, position: 'relative' }}>
          <p className="text-muted" style={{ margin: 0 }}>Общий баланс</p>
          <button onClick={() => setHideBalance(!hideBalance)} style={{ color: 'var(--text-muted)' }}>
            {hideBalance ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        <h3 className="text-gradient" style={{ fontSize: '32px', fontWeight: '700', marginBottom: '4px' }}>
          {hideBalance ? '*** UZS' : formatCurrency(totalBalanceUZS, 'UZS')}
        </h3>
        {totalBalanceUSD > 0 && !hideBalance && (
          <h4 style={{ fontSize: '20px', opacity: 0.8 }}>
            {formatCurrency(totalBalanceUSD, 'USD')}
          </h4>
        )}
        {totalBalanceUSD > 0 && hideBalance && (
          <h4 style={{ fontSize: '20px', opacity: 0.8 }}>*** USD</h4>
        )}

        {/* Quick Planning Pills */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border-color)' }}>
          <Link
            to="/planning?tab=goals"
            style={{
              textDecoration: 'none',
              color: 'var(--text-primary)',
              background: 'var(--bg-tertiary)',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Target size={15} style={{ color: 'var(--success)', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Цели ({goals.length})
            </span>
          </Link>
          <Link
            to="/planning?tab=debts"
            style={{
              textDecoration: 'none',
              color: 'var(--text-primary)',
              background: 'var(--bg-tertiary)',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <HandCoins size={15} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Долги ({activeDebtsCount})
            </span>
          </Link>
          <Link
            to="/planning?tab=subscriptions"
            style={{
              textDecoration: 'none',
              color: 'var(--text-primary)',
              background: 'var(--bg-tertiary)',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <CalendarClock size={15} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Подписки ({subscriptions.length})
            </span>
          </Link>
        </div>
      </div>

      {/* Upcoming / Due Subscriptions 1-Click Widget */}
      {dueSubscriptions.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CalendarClock size={16} style={{ color: '#f59e0b' }} />
              <span>Ближайшие платежи ({dueSubscriptions.length})</span>
            </h3>
            <Link to="/planning?tab=subscriptions" style={{ fontSize: '13px', color: 'var(--accent-primary)' }}>Все</Link>
          </div>
          <div className="glass-panel" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {dueSubscriptions.map(sub => {
              const diff = differenceInCalendarDays(new Date(sub.nextDueDate), new Date());
              return (
                <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{sub.name}</div>
                    <div style={{ fontSize: '11px', color: diff < 0 ? 'var(--danger)' : '#f59e0b', fontWeight: 500 }}>
                      {diff < 0 ? `Просрочено (${Math.abs(diff)} дн.)` : diff === 0 ? 'Оплата сегодня' : `Через ${diff} дн.`} •{' '}
                      {hideBalance ? '***' : formatCurrency(sub.amount, sub.currency)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickPaySubscription(sub)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--accent-primary)',
                      color: 'white',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      flexShrink: 0,
                    }}
                  >
                    <Play size={12} />
                    <span>Провести</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Monthly Budgets Widget */}
      {budgetItems.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Лимиты на {format(new Date(), 'LLLL', { locale: ru })}</h3>
            <Link to="/categories" style={{ fontSize: '13px', color: 'var(--accent-primary)' }}>Настроить</Link>
          </div>
          <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {budgetItems.map(({ category, limit, spent, pct }) => {
              const IconComp = getIcon(category.iconName);
              const barColor = pct >= 100 ? 'var(--danger)' : pct >= 80 ? '#f59e0b' : 'var(--success)';
              const overAmount = spent - limit;
              return (
                <Link
                  key={category.id}
                  to={`/history?category=${category.id}&type=expense`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <IconComp size={16} color={category.color} />
                      <span style={{ fontSize: '14px', fontWeight: 500 }}>{category.name}</span>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: pct >= 100 ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {hideBalance ? '***' : `${formatCurrency(spent, '')} / ${formatCurrency(limit, 'UZS')}`} ({Math.round(pct)}%)
                    </div>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, pct)}%`,
                      height: '100%',
                      background: barColor,
                      borderRadius: '3px',
                      transition: 'width 0.4s ease'
                    }} />
                  </div>
                  {overAmount > 0 && !hideBalance && (
                    <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '3px', fontWeight: 500 }}>
                      Перерасход: +{formatCurrency(overAmount, 'UZS')}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Последние операции</h3>
          <Link to="/history" style={{ fontSize: '14px', color: 'var(--accent-primary)' }}>Все</Link>
        </div>
        
        <div className="glass-panel" style={{ padding: '8px 16px' }}>
          {recentTransactions.length === 0 ? (
            <p className="text-muted" style={{ padding: '16px 0', textAlign: 'center' }}>Нет операций</p>
          ) : (
            recentTransactions.map((t, idx) => {
              const category = categories.find(c => c.id === t.categoryId);
              const isTransfer = t.type === 'transfer';
              const isIncome = t.type === 'income';
              
              // For transfers, we can use a generic icon if category is missing
              const IconComp = isTransfer ? Wallet : getIcon(category?.iconName || '');
              const color = isTransfer ? '#8b5cf6' : (category?.color || '#94a3b8');
              const name = isTransfer ? 'Перевод' : (category?.name || 'Неизвестно');

              return (
                <Link key={t.id} to={`/edit/${t.id}`} style={{ 
                  display: 'flex', alignItems: 'center', padding: '12px 0', 
                  borderBottom: idx < recentTransactions.length - 1 ? '1px solid var(--border-color)' : 'none',
                  textDecoration: 'none', color: 'inherit'
                }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: 'var(--radius-md)',
                    background: `${color}20`, color: color,
                    display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '16px', flexShrink: 0
                  }}>
                    <IconComp size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '2px' }}>{name}</h4>
                    <p className="text-muted" style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {format(new Date(t.date), 'd MMM', { locale: ru })} {t.note && `• ${t.note}`}
                    </p>
                    {t.tags && t.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                        {t.tags.map(tag => (
                          <span key={tag} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: 'var(--bg-tertiary)', color: 'var(--accent-primary)', fontWeight: 500 }}>
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <p style={{ 
                      fontSize: '16px', fontWeight: 600, 
                      color: isIncome ? 'var(--success)' : (isTransfer ? 'var(--text-primary)' : 'var(--text-primary)') 
                    }}>
                      {isIncome ? '+' : (isTransfer ? '' : '-')}{formatCurrency(t.amount, t.currency)}
                    </p>
                    
                    {!isTransfer && !category?.excludeFromStats && (
                      <button 
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          await updateTransaction(t.id, { excludeFromStats: !t.excludeFromStats });
                        }}
                        style={{ color: t.excludeFromStats ? 'var(--text-muted)' : 'var(--accent-primary)', padding: '4px' }}
                        title={t.excludeFromStats ? "Показывать в статистике" : "Скрыть из статистики"}
                      >
                        {t.excludeFromStats ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    )}
                    {!isTransfer && category?.excludeFromStats && (
                      <div 
                        style={{ color: 'var(--text-muted)', padding: '4px', opacity: 0.5 }}
                        title="Скрыто из статистики настройками категории"
                      >
                        <EyeOff size={18} />
                      </div>
                    )}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>
      {isSettingsOpen && (
        <Suspense fallback={null}>
          <SettingsSidebar isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </Suspense>
      )}
    </div>
  );
};

const BottomNav = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="bottom-nav">
      <Link to="/" className={`nav-item ${isActive('/') ? 'active' : ''}`}>
        <LayoutGrid size={22} strokeWidth={isActive('/') ? 2.5 : 2} />
        <span>Главная</span>
      </Link>
      <Link to="/history" className={`nav-item ${isActive('/history') ? 'active' : ''}`}>
        <ListIcon size={22} strokeWidth={isActive('/history') ? 2.5 : 2} />
        <span>История</span>
      </Link>
      
      <div className="nav-item-fab-container">
        <Link to="/add" className="fab">
          <Plus size={30} strokeWidth={2.5} />
        </Link>
      </div>

      <Link to="/analytics" className={`nav-item ${isActive('/analytics') ? 'active' : ''}`}>
        <PieChart size={22} strokeWidth={isActive('/analytics') ? 2.5 : 2} />
        <span>Аналитика</span>
      </Link>
      <Link to="/accounts" className={`nav-item ${isActive('/accounts') ? 'active' : ''}`}>
        <Wallet size={22} strokeWidth={isActive('/accounts') ? 2.5 : 2} />
        <span>Счета</span>
      </Link>
    </div>
  );
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { currentUser, authChecked } = useStore();
  const [isLocked, setIsLocked] = useState(() => hasPinEnabled());

  useEffect(() => {
    let hiddenAt = 0;
    const handleVisibility = () => {
      if (!hasPinEnabled()) return;
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt > 0 && Date.now() - hiddenAt > 120_000) {
        // Re-lock after 2 minutes in background
        setIsLocked(true);
        hiddenAt = 0;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
  
  if (!authChecked) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh', background: 'var(--bg-primary)' }}>
        <Loader2 size={40} className="animate-spin text-accent" style={{ color: 'var(--accent-primary)' }} />
      </div>
    );
  }
  
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (isLocked && hasPinEnabled()) {
    return (
      <Suspense fallback={<PageLoader />}>
        <AppLockScreen onUnlock={() => setIsLocked(false)} />
      </Suspense>
    );
  }

  return <>{children}</>;
};

export default function App() {
  useEffect(() => {
    const theme = localStorage.getItem('theme') || 'system';
    if (theme === 'dark') {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else if (theme === 'light') {
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    } else {
      document.body.classList.remove('dark', 'light');
    }
  }, []);

  return (
    <BrowserRouter>
      <div className="app-container">
        <main className="main-content">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/*" element={
                <ProtectedRoute>
                  <div style={{ paddingBottom: '120px' }}>
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/history" element={<History />} />
                        <Route path="/planning" element={<Planning />} />
                        <Route path="/analytics" element={<Analytics />} />
                        <Route path="/accounts" element={<Accounts />} />
                        <Route path="/account/:id" element={<AccountDetails />} />
                        <Route path="/add" element={<AddTransaction />} />
                        <Route path="/edit/:id" element={<AddTransaction />} />
                        <Route path="/categories" element={<Categories />} />
                      </Routes>
                    </Suspense>
                    <BottomNav />
                  </div>
                </ProtectedRoute>
              } />
            </Routes>
          </Suspense>
        </main>
      </div>
    </BrowserRouter>
  );
}
