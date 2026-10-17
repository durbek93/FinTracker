import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Target,
  HandCoins,
  CalendarClock,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  ArrowUpRight,
  ArrowDownLeft,
  Play,
  Calendar,
  Wallet,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../store';
import { Currency, Debt, DebtType, Goal, RecurrenceInterval, Subscription } from '../types';
import { getIcon, AVAILABLE_ICON_NAMES } from '../lib/icons';
import { format, addWeeks, addMonths, addYears, differenceInCalendarDays } from 'date-fns';
import { ru } from 'date-fns/locale';

type PlanningTab = 'goals' | 'debts' | 'subscriptions';

const GOAL_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444'];

const formatCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat('ru-RU').format(Math.round(amount)) + ' ' + currency;

const formatInputNumber = (val: string) => {
  if (!val) return '';
  const cleaned = val.replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.length > 1 ? `${parts[0]}.${parts[1].slice(0, 2)}` : parts[0];
};

const parseFormattedNumber = (val: string): number => {
  const num = parseFloat(val.replace(/\s+/g, ''));
  return isNaN(num) ? 0 : num;
};

export const advanceDueDate = (dateStr: string, interval: RecurrenceInterval): string => {
  const base = new Date(dateStr);
  const validBase = isNaN(base.getTime()) ? new Date() : base;
  const next =
    interval === 'weekly'
      ? addWeeks(validBase, 1)
      : interval === 'yearly'
      ? addYears(validBase, 1)
      : addMonths(validBase, 1);
  return format(next, 'yyyy-MM-dd');
};

export default function Planning() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as PlanningTab) || 'goals';
  const [activeTab, setActiveTab] = useState<PlanningTab>(
    ['goals', 'debts', 'subscriptions'].includes(initialTab) ? initialTab : 'goals'
  );

  const {
    goals,
    addGoal,
    updateGoal,
    deleteGoal,
    debts,
    addDebt,
    updateDebt,
    deleteDebt,
    subscriptions,
    addSubscription,
    updateSubscription,
    deleteSubscription,
    accounts,
    categories,
    addTransaction,
  } = useStore();

  const switchTab = (tab: PlanningTab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  // ─── GOAL STATES ───
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalCurrent, setGoalCurrent] = useState('');
  const [goalCurrency, setGoalCurrency] = useState<Currency>('UZS');
  const [goalColor, setGoalColor] = useState(GOAL_COLORS[0]);
  const [goalIcon, setGoalIcon] = useState('PiggyBank');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalNote, setGoalNote] = useState('');

  // Goal Deposit/Withdraw Modal
  const [adjustGoal, setAdjustGoal] = useState<Goal | null>(null);
  const [adjustMode, setAdjustMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [syncWithAccount, setSyncWithAccount] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  // ─── DEBT STATES ───
  const [debtFilter, setDebtFilter] = useState<'active' | 'settled' | 'all'>('active');
  const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
  const [personName, setPersonName] = useState('');
  const [debtType, setDebtType] = useState<DebtType>('lent');
  const [debtTotal, setDebtTotal] = useState('');
  const [debtCurrency, setDebtCurrency] = useState<Currency>('UZS');
  const [debtDueDate, setDebtDueDate] = useState('');
  const [debtNote, setDebtNote] = useState('');
  const [debtCreateSyncAccount, setDebtCreateSyncAccount] = useState(false);
  const [debtAccountId, setDebtAccountId] = useState('');

  // Debt Repay Modal
  const [repayDebt, setRepayDebt] = useState<Debt | null>(null);
  const [repayAmount, setRepayAmount] = useState('');
  const [repaySyncAccount, setRepaySyncAccount] = useState(true);
  const [repayAccountId, setRepayAccountId] = useState('');

  // ─── SUBSCRIPTION STATES ───
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [subName, setSubName] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [subCurrency, setSubCurrency] = useState<Currency>('UZS');
  const [subType, setSubType] = useState<'expense' | 'income'>('expense');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [subAccountId, setSubAccountId] = useState('');
  const [subInterval, setSubInterval] = useState<RecurrenceInterval>('monthly');
  const [subNextDate, setSubNextDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [subNote, setSubNote] = useState('');

  // ─── HANDLERS: GOALS ───
  const openCreateGoal = () => {
    setEditingGoal(null);
    setGoalName('');
    setGoalTarget('');
    setGoalCurrent('');
    setGoalCurrency('UZS');
    setGoalColor(GOAL_COLORS[0]);
    setGoalIcon('PiggyBank');
    setGoalDeadline('');
    setGoalNote('');
    setIsGoalModalOpen(true);
  };

  const openEditGoal = (g: Goal) => {
    setEditingGoal(g);
    setGoalName(g.name);
    setGoalTarget(formatInputNumber(String(g.targetAmount)));
    setGoalCurrent(formatInputNumber(String(g.currentAmount)));
    setGoalCurrency(g.currency);
    setGoalColor(g.color || GOAL_COLORS[0]);
    setGoalIcon(g.iconName || 'PiggyBank');
    setGoalDeadline(g.deadline || '');
    setGoalNote(g.note || '');
    setIsGoalModalOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFormattedNumber(goalTarget);
    const current = parseFormattedNumber(goalCurrent);
    if (!goalName.trim() || target <= 0) return;

    const payload: Omit<Goal, 'id'> = {
      name: goalName.trim(),
      targetAmount: target,
      currentAmount: current,
      currency: goalCurrency,
      color: goalColor,
      iconName: goalIcon,
      ...(goalDeadline ? { deadline: goalDeadline } : {}),
      ...(goalNote.trim() ? { note: goalNote.trim() } : {}),
    };

    if (editingGoal) {
      await updateGoal(editingGoal.id, payload);
    } else {
      await addGoal(payload);
    }
    setIsGoalModalOpen(false);
  };

  const openAdjustGoalModal = (g: Goal, mode: 'deposit' | 'withdraw') => {
    setAdjustGoal(g);
    setAdjustMode(mode);
    setAdjustAmount('');
    const matchingAcc = accounts.find(a => (a.currency || 'UZS') === g.currency) || accounts[0];
    setSelectedAccountId(matchingAcc?.id || '');
    const txType = mode === 'deposit' ? 'expense' : 'income';
    const matchingCat = categories.find(c => c.type === txType) || categories[0];
    setSelectedCategoryId(matchingCat?.id || '');
    setSyncWithAccount(Boolean(matchingAcc));
  };

  const handleConfirmGoalAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustGoal) return;
    const delta = parseFormattedNumber(adjustAmount);
    if (delta <= 0) return;

    const newCurrent =
      adjustMode === 'deposit'
        ? adjustGoal.currentAmount + delta
        : Math.max(0, adjustGoal.currentAmount - delta);

    await updateGoal(adjustGoal.id, { currentAmount: newCurrent });

    if (syncWithAccount && selectedAccountId) {
      const txType = adjustMode === 'deposit' ? 'expense' : 'income';
      const defaultCat = categories.find(c => c.type === txType)?.id || '';
      await addTransaction({
        amount: delta,
        currency: adjustGoal.currency,
        categoryId: selectedCategoryId || defaultCat,
        accountId: selectedAccountId,
        date: new Date().toISOString(),
        type: txType,
        note: `${adjustMode === 'deposit' ? 'Пополнение копилки' : 'Снятие из копилки'}: ${adjustGoal.name}`,
        tags: ['копилка'],
      });
    }

    setAdjustGoal(null);
  };

  // ─── HANDLERS: DEBTS ───
  const openCreateDebt = () => {
    setPersonName('');
    setDebtType('lent');
    setDebtTotal('');
    setDebtCurrency('UZS');
    setDebtDueDate('');
    setDebtNote('');
    setDebtCreateSyncAccount(false);
    setDebtAccountId(accounts[0]?.id || '');
    setIsDebtModalOpen(true);
  };

  const handleSaveDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseFormattedNumber(debtTotal);
    if (!personName.trim() || total <= 0) return;

    await addDebt({
      personName: personName.trim(),
      type: debtType,
      totalAmount: total,
      paidAmount: 0,
      currency: debtCurrency,
      ...(debtDueDate ? { dueDate: debtDueDate } : {}),
      ...(debtNote.trim() ? { note: debtNote.trim() } : {}),
      isSettled: false,
      createdAt: new Date().toISOString(),
    });

    if (debtCreateSyncAccount && debtAccountId) {
      const txType = debtType === 'lent' ? 'expense' : 'income';
      const catId = categories.find(c => c.type === txType)?.id || '';
      await addTransaction({
        amount: total,
        currency: debtCurrency,
        categoryId: catId,
        accountId: debtAccountId,
        date: new Date().toISOString(),
        type: txType,
        excludeFromStats: true,
        note: `${debtType === 'lent' ? 'Дал в долг' : 'Взял в долг'}: ${personName.trim()}${debtNote ? ` (${debtNote})` : ''}`,
        tags: ['долг'],
      });
    }

    setIsDebtModalOpen(false);
  };

  const openRepayModal = (d: Debt) => {
    const remaining = Math.max(0, d.totalAmount - d.paidAmount);
    setRepayDebt(d);
    setRepayAmount(formatInputNumber(String(remaining)));
    const matchingAcc = accounts.find(a => (a.currency || 'UZS') === d.currency) || accounts[0];
    setRepayAccountId(matchingAcc?.id || '');
    setRepaySyncAccount(Boolean(matchingAcc));
  };

  const handleConfirmRepay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repayDebt) return;
    const payAmt = parseFormattedNumber(repayAmount);
    if (payAmt <= 0) return;

    const newPaid = repayDebt.paidAmount + payAmt;
    const isSettled = newPaid >= repayDebt.totalAmount;

    await updateDebt(repayDebt.id, {
      paidAmount: newPaid,
      isSettled,
    });

    if (repaySyncAccount && repayAccountId) {
      // If someone owed us (lent) and pays back -> income; if we owed (borrowed) and pay back -> expense
      const txType = repayDebt.type === 'lent' ? 'income' : 'expense';
      const catId = categories.find(c => c.type === txType)?.id || '';
      await addTransaction({
        amount: payAmt,
        currency: repayDebt.currency,
        categoryId: catId,
        accountId: repayAccountId,
        date: new Date().toISOString(),
        type: txType,
        excludeFromStats: true,
        note: `${repayDebt.type === 'lent' ? 'Возврат долга от' : 'Погашение долга'}: ${repayDebt.personName}`,
        tags: ['долг'],
      });
    }

    setRepayDebt(null);
  };

  // ─── HANDLERS: SUBSCRIPTIONS ───
  const openCreateSub = () => {
    setSubName('');
    setSubAmount('');
    setSubCurrency('UZS');
    setSubType('expense');
    const expCat = categories.find(c => c.type === 'expense') || categories[0];
    setSubCategoryId(expCat?.id || '');
    setSubAccountId(accounts[0]?.id || '');
    setSubInterval('monthly');
    setSubNextDate(format(new Date(), 'yyyy-MM-dd'));
    setSubNote('');
    setIsSubModalOpen(true);
  };

  const handleSaveSub = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFormattedNumber(subAmount);
    if (!subName.trim() || amt <= 0) return;

    await addSubscription({
      name: subName.trim(),
      amount: amt,
      currency: subCurrency,
      type: subType,
      categoryId: subCategoryId || categories.find(c => c.type === subType)?.id || '',
      accountId: subAccountId || accounts[0]?.id || '',
      interval: subInterval,
      nextDueDate: subNextDate,
      isActive: true,
      ...(subNote.trim() ? { note: subNote.trim() } : {}),
    });

    setIsSubModalOpen(false);
  };

  const handleExecuteSubscription = async (sub: Subscription) => {
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

    const nextDate = advanceDueDate(sub.nextDueDate, sub.interval);
    await updateSubscription(sub.id, { nextDueDate: nextDate });
  };

  // ─── SUMMARY METRICS ───
  const goalsSummary = useMemo(() => {
    let savedUZS = 0;
    let targetUZS = 0;
    let savedUSD = 0;
    let targetUSD = 0;
    for (const g of goals) {
      if (g.currency === 'USD') {
        savedUSD += g.currentAmount;
        targetUSD += g.targetAmount;
      } else {
        savedUZS += g.currentAmount;
        targetUZS += g.targetAmount;
      }
    }
    return { savedUZS, targetUZS, savedUSD, targetUSD };
  }, [goals]);

  const debtsSummary = useMemo(() => {
    let lentUZS = 0;
    let borrowedUZS = 0;
    let lentUSD = 0;
    let borrowedUSD = 0;
    for (const d of debts) {
      if (d.isSettled) continue;
      const rem = Math.max(0, d.totalAmount - d.paidAmount);
      if (d.type === 'lent') {
        if (d.currency === 'USD') lentUSD += rem;
        else lentUZS += rem;
      } else {
        if (d.currency === 'USD') borrowedUSD += rem;
        else borrowedUZS += rem;
      }
    }
    return { lentUZS, borrowedUZS, lentUSD, borrowedUSD };
  }, [debts]);

  const filteredDebts = useMemo(() => {
    return debts.filter(d => {
      if (debtFilter === 'active') return !d.isSettled;
      if (debtFilter === 'settled') return Boolean(d.isSettled);
      return true;
    });
  }, [debts, debtFilter]);

  const monthlySubExpenseUZS = useMemo(() => {
    return subscriptions
      .filter(s => s.isActive && s.type === 'expense' && s.currency === 'UZS')
      .reduce((acc, s) => {
        if (s.interval === 'weekly') return acc + s.amount * 4.33;
        if (s.interval === 'yearly') return acc + s.amount / 12;
        return acc + s.amount;
      }, 0);
  }, [subscriptions]);

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <h2>Планирование</h2>
        <button
          onClick={() => {
            if (activeTab === 'goals') openCreateGoal();
            else if (activeTab === 'debts') openCreateDebt();
            else openCreateSub();
          }}
          style={{
            background: 'var(--accent-primary)',
            color: 'white',
            padding: '8px 14px',
            borderRadius: 'var(--radius-full)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 600,
            fontSize: '13px',
          }}
        >
          <Plus size={16} />
          <span>Добавить</span>
        </button>
      </div>

      {/*Segmented Control Tabs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '6px',
          padding: '4px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-color)',
        }}
      >
        <button
          type="button"
          onClick={() => switchTab('goals')}
          style={{
            padding: '10px 8px',
            borderRadius: 'var(--radius-sm)',
            background: activeTab === 'goals' ? 'var(--accent-primary)' : 'transparent',
            color: activeTab === 'goals' ? 'white' : 'var(--text-muted)',
            fontWeight: 600,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s',
          }}
        >
          <Target size={16} />
          <span>Цели ({goals.length})</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab('debts')}
          style={{
            padding: '10px 8px',
            borderRadius: 'var(--radius-sm)',
            background: activeTab === 'debts' ? 'var(--accent-primary)' : 'transparent',
            color: activeTab === 'debts' ? 'white' : 'var(--text-muted)',
            fontWeight: 600,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s',
          }}
        >
          <HandCoins size={16} />
          <span>Долги ({debts.filter(d => !d.isSettled).length})</span>
        </button>
        <button
          type="button"
          onClick={() => switchTab('subscriptions')}
          style={{
            padding: '10px 8px',
            borderRadius: 'var(--radius-sm)',
            background: activeTab === 'subscriptions' ? 'var(--accent-primary)' : 'transparent',
            color: activeTab === 'subscriptions' ? 'white' : 'var(--text-muted)',
            fontWeight: 600,
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s',
          }}
        >
          <CalendarClock size={16} />
          <span>Подписки ({subscriptions.length})</span>
        </button>
      </div>

      {/* ─────────────── TAB 1: GOALS ─────────────── */}
      {activeTab === 'goals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass-panel" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span className="text-muted" style={{ fontSize: '13px' }}>Накоплено во всех копилках</span>
              <Sparkles size={18} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success)' }}>
              {formatCurrency(goalsSummary.savedUZS, 'UZS')}
            </div>
            {goalsSummary.targetUZS > 0 && (
              <div className="text-muted" style={{ fontSize: '12px', marginTop: '2px' }}>
                Цель: {formatCurrency(goalsSummary.targetUZS, 'UZS')} ({Math.round((goalsSummary.savedUZS / goalsSummary.targetUZS) * 100)}%)
              </div>
            )}
            {(goalsSummary.savedUSD > 0 || goalsSummary.targetUSD > 0) && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '14px', fontWeight: 600 }}>
                Валютные цели: {formatCurrency(goalsSummary.savedUSD, 'USD')} из {formatCurrency(goalsSummary.targetUSD, 'USD')}
              </div>
            )}
          </div>

          {goals.length === 0 ? (
            <div className="glass-panel" style={{ padding: '32px 20px', textAlign: 'center' }}>
              <Target size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
              <h4 style={{ fontSize: '16px', marginBottom: '6px' }}>У вас пока нет финансовых целей</h4>
              <p className="text-muted" style={{ fontSize: '13px', marginBottom: '16px' }}>
                Создайте копилку на отпуск, подушку безопасности или крупную покупку и пополняйте её со своих счетов.
              </p>
              <button
                onClick={openCreateGoal}
                style={{
                  background: 'var(--accent-primary)',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Создать первую цель
              </button>
            </div>
          ) : (
            goals.map(g => {
              const IconComp = getIcon(g.iconName || 'PiggyBank');
              const pct = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
              const remaining = Math.max(0, g.targetAmount - g.currentAmount);
              const daysLeft = g.deadline ? differenceInCalendarDays(new Date(g.deadline), new Date()) : null;

              return (
                <div key={g.id} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: 'var(--radius-md)',
                          background: `${g.color || '#3b82f6'}22`,
                          color: g.color || '#3b82f6',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <IconComp size={22} />
                      </div>
                      <div>
                        <h4 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '2px' }}>{g.name}</h4>
                        <div className="text-muted" style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span>{Math.round(pct)}% выполнено</span>
                          {daysLeft !== null && (
                            <span style={{ color: daysLeft < 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                              • {daysLeft >= 0 ? `Осталось ${daysLeft} дн.` : `Срок истёк (${Math.abs(daysLeft)} дн.)`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => openEditGoal(g)} style={{ padding: '6px', color: 'var(--text-muted)' }}>
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Удалить цель «${g.name}»?`)) deleteGoal(g.id);
                        }}
                        style={{ padding: '6px', color: 'var(--danger)' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700, color: g.color || 'var(--accent-primary)' }}>
                        {formatCurrency(g.currentAmount, g.currency)}
                      </span>
                      <span className="text-muted">из {formatCurrency(g.targetAmount, g.currency)}</span>
                    </div>
                    <div style={{ width: '100%', height: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: g.color || 'var(--accent-primary)',
                          borderRadius: '4px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                    {remaining > 0 ? (
                      <div className="text-muted" style={{ fontSize: '11px', marginTop: '4px' }}>
                        Осталось накопить: {formatCurrency(remaining, g.currency)}
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 600, marginTop: '4px' }}>
                        🎉 Цель достигнута!
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => openAdjustGoalModal(g, 'deposit')}
                      style={{
                        padding: '10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'rgba(16, 185, 129, 0.14)',
                        color: 'var(--success)',
                        fontWeight: 600,
                        fontSize: '13px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Plus size={16} />
                      <span>Пополнить</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openAdjustGoalModal(g, 'withdraw')}
                      disabled={g.currentAmount <= 0}
                      style={{
                        padding: '10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        fontWeight: 600,
                        fontSize: '13px',
                        opacity: g.currentAmount <= 0 ? 0.5 : 1,
                      }}
                    >
                      Снять
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─────────────── TAB 2: DEBTS ─────────────── */}
      {activeTab === 'debts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="glass-panel" style={{ padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontSize: '12px', marginBottom: '4px' }}>
                <ArrowDownLeft size={16} />
                <span>Мне должны</span>
              </div>
              <div style={{ fontSize: '17px', fontWeight: 700 }}>{formatCurrency(debtsSummary.lentUZS, 'UZS')}</div>
              {debtsSummary.lentUSD > 0 && (
                <div className="text-muted" style={{ fontSize: '12px' }}>+ {formatCurrency(debtsSummary.lentUSD, 'USD')}</div>
              )}
            </div>
            <div className="glass-panel" style={{ padding: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--danger)', fontSize: '12px', marginBottom: '4px' }}>
                <ArrowUpRight size={16} />
                <span>Я должен</span>
              </div>
              <div style={{ fontSize: '17px', fontWeight: 700 }}>{formatCurrency(debtsSummary.borrowedUZS, 'UZS')}</div>
              {debtsSummary.borrowedUSD > 0 && (
                <div className="text-muted" style={{ fontSize: '12px' }}>+ {formatCurrency(debtsSummary.borrowedUSD, 'USD')}</div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {(['active', 'settled', 'all'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setDebtFilter(f)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: debtFilter === f ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                  color: debtFilter === f ? 'white' : 'var(--text-muted)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {f === 'active' ? 'Активные' : f === 'settled' ? 'Закрытые' : 'Все'}
              </button>
            ))}
          </div>

          {filteredDebts.length === 0 ? (
            <div className="glass-panel" style={{ padding: '32px 20px', textAlign: 'center' }}>
              <HandCoins size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
              <h4 style={{ fontSize: '16px', marginBottom: '6px' }}>Список долгов пуст</h4>
              <p className="text-muted" style={{ fontSize: '13px', marginBottom: '16px' }}>
                Фиксируйте займы и долги с привязкой к реальным счетам и отслеживанием частичных возвратов.
              </p>
              <button
                onClick={openCreateDebt}
                style={{
                  background: 'var(--accent-primary)',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Добавить запись о долге
              </button>
            </div>
          ) : (
            filteredDebts.map(d => {
              const remaining = Math.max(0, d.totalAmount - d.paidAmount);
              const pct = d.totalAmount > 0 ? Math.min(100, (d.paidAmount / d.totalAmount) * 100) : 0;
              const isLent = d.type === 'lent';
              const daysLeft = d.dueDate ? differenceInCalendarDays(new Date(d.dueDate), new Date()) : null;

              return (
                <div
                  key={d.id}
                  className="glass-panel"
                  style={{
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    opacity: d.isSettled ? 0.65 : 1,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontWeight: 600,
                            background: isLent ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: isLent ? 'var(--success)' : 'var(--danger)',
                          }}
                        >
                          {isLent ? 'Мне должны' : 'Я должен'}
                        </span>
                        {d.isSettled && (
                          <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 600 }}>✓ Погашено</span>
                        )}
                      </div>
                      <h4 style={{ fontSize: '17px', fontWeight: 700, marginTop: '6px' }}>{d.personName}</h4>
                      {d.note && <p className="text-muted" style={{ fontSize: '12px', marginTop: '2px' }}>{d.note}</p>}
                    </div>

                    <button
                      onClick={() => {
                        if (confirm(`Удалить запись о долге «${d.personName}»?`)) deleteDebt(d.id);
                      }}
                      style={{ color: 'var(--danger)', padding: '4px' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '5px' }}>
                      <span style={{ fontWeight: 700 }}>
                        Остаток: {formatCurrency(remaining, d.currency)}
                      </span>
                      <span className="text-muted">
                        Возвращено {formatCurrency(d.paidAmount, '')} из {formatCurrency(d.totalAmount, d.currency)}
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          background: isLent ? 'var(--success)' : 'var(--accent-primary)',
                          borderRadius: '3px',
                        }}
                      />
                    </div>
                    {d.dueDate && !d.isSettled && (
                      <div
                        style={{
                          fontSize: '11px',
                          marginTop: '6px',
                          color: daysLeft !== null && daysLeft < 0 ? 'var(--danger)' : 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Calendar size={12} />
                        <span>
                          Срок возврата: {format(new Date(d.dueDate), 'd MMM yyyy', { locale: ru })}
                          {daysLeft !== null && daysLeft < 0 ? ` (просрочено на ${Math.abs(daysLeft)} дн.)` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  {!d.isSettled && (
                    <button
                      type="button"
                      onClick={() => openRepayModal(d)}
                      style={{
                        padding: '10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--accent-primary)',
                        color: 'white',
                        fontWeight: 600,
                        fontSize: '13px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Check size={16} />
                      <span>{isLent ? 'Получить возврат' : 'Внести платёж'}</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─────────────── TAB 3: SUBSCRIPTIONS ─────────────── */}
      {activeTab === 'subscriptions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="glass-panel" style={{ padding: '18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span className="text-muted" style={{ fontSize: '13px' }}>Ежемесячная нагрузка регулярных платежей</span>
              <CalendarClock size={18} style={{ color: 'var(--accent-primary)' }} />
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700 }}>
              {formatCurrency(monthlySubExpenseUZS, 'UZS')} <span className="text-muted" style={{ fontSize: '13px', fontWeight: 500 }}>/ мес</span>
            </div>
          </div>

          {subscriptions.length === 0 ? (
            <div className="glass-panel" style={{ padding: '32px 20px', textAlign: 'center' }}>
              <CalendarClock size={40} style={{ color: 'var(--text-muted)', margin: '0 auto 12px' }} />
              <h4 style={{ fontSize: '16px', marginBottom: '6px' }}>Нет регулярных платежей</h4>
              <p className="text-muted" style={{ fontSize: '13px', marginBottom: '16px' }}>
                Добавьте аренду, интернет, подписки или зарплату — приложение напомнит о дате и проведёт платёж в 1 клик.
              </p>
              <button
                onClick={openCreateSub}
                style={{
                  background: 'var(--accent-primary)',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                Добавить подписку
              </button>
            </div>
          ) : (
            subscriptions.map(sub => {
              const cat = categories.find(c => c.id === sub.categoryId);
              const acc = accounts.find(a => a.id === sub.accountId);
              const daysUntil = differenceInCalendarDays(new Date(sub.nextDueDate), new Date());
              const isOverdue = daysUntil < 0;
              const isSoon = daysUntil >= 0 && daysUntil <= 3;
              const intervalLabel =
                sub.interval === 'weekly' ? 'Еженедельно' : sub.interval === 'yearly' ? 'Ежегодно' : 'Ежемесячно';

              return (
                <div key={sub.id} className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontWeight: 600,
                            background: isOverdue
                              ? 'rgba(239, 68, 68, 0.15)'
                              : isSoon
                              ? 'rgba(245, 158, 11, 0.18)'
                              : 'var(--bg-tertiary)',
                            color: isOverdue ? 'var(--danger)' : isSoon ? '#f59e0b' : 'var(--text-muted)',
                          }}
                        >
                          {isOverdue
                            ? `Просрочено (${Math.abs(daysUntil)} дн.)`
                            : daysUntil === 0
                            ? 'Сегодня!'
                            : `Через ${daysUntil} дн.`}
                        </span>
                        <span className="text-muted" style={{ fontSize: '11px' }}>{intervalLabel}</span>
                      </div>
                      <h4 style={{ fontSize: '16px', fontWeight: 700, marginTop: '6px' }}>{sub.name}</h4>
                      <div className="text-muted" style={{ fontSize: '12px', marginTop: '2px' }}>
                        {cat?.name || 'Без категории'} • {acc?.name || 'Счёт по умолчанию'} • След.:{' '}
                        {format(new Date(sub.nextDueDate), 'd MMM yyyy', { locale: ru })}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '16px',
                          fontWeight: 700,
                          color: sub.type === 'income' ? 'var(--success)' : 'var(--text-primary)',
                        }}
                      >
                        {sub.type === 'income' ? '+' : '-'}{formatCurrency(sub.amount, sub.currency)}
                      </span>
                      <button
                        onClick={() => {
                          if (confirm(`Удалить регулярный платёж «${sub.name}»?`)) deleteSubscription(sub.id);
                        }}
                        style={{ color: 'var(--danger)', padding: '4px' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExecuteSubscription(sub)}
                    style={{
                      padding: '10px',
                      borderRadius: 'var(--radius-sm)',
                      background: isOverdue || isSoon ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: isOverdue || isSoon ? 'white' : 'var(--text-primary)',
                      fontWeight: 600,
                      fontSize: '13px',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Play size={15} />
                    <span>Провести сейчас и сдвинуть дату</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ─── MODAL: CREATE / EDIT GOAL ─── */}
      {isGoalModalOpen && (
        <div
          onClick={() => setIsGoalModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px',
          }}
        >
          <form
            onSubmit={handleSaveGoal}
            onClick={e => e.stopPropagation()}
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '420px',
              padding: '20px',
              background: 'var(--bg-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              maxHeight: '88dvh',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
                {editingGoal ? 'Редактировать цель' : 'Новая финансовая цель'}
              </h3>
              <button type="button" onClick={() => setIsGoalModalOpen(false)} style={{ color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <input
              type="text"
              placeholder="Название цели (напр., Подушка безопасности)"
              value={goalName}
              onChange={e => setGoalName(e.target.value)}
              required
            />

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Целевая сумма"
                value={goalTarget}
                onChange={e => setGoalTarget(formatInputNumber(e.target.value))}
                required
                style={{ flex: 1 }}
              />
              <select
                value={goalCurrency}
                onChange={e => setGoalCurrency(e.target.value as Currency)}
                style={{
                  padding: '0 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  fontWeight: 600,
                }}
              >
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <input
              type="text"
              inputMode="decimal"
              placeholder="Уже накоплено (необязательно)"
              value={goalCurrent}
              onChange={e => setGoalCurrent(formatInputNumber(e.target.value))}
            />

            <div>
              <label className="text-muted" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                Желаемая дата достижения (необязательно)
              </label>
              <input type="date" value={goalDeadline} onChange={e => setGoalDeadline(e.target.value)} style={{ width: '100%' }} />
            </div>

            <div>
              <label className="text-muted" style={{ fontSize: '12px', display: 'block', marginBottom: '6px' }}>Цвет и иконка</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                {GOAL_COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setGoalColor(c)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: c,
                      border: goalColor === c ? '3px solid white' : 'none',
                      boxShadow: goalColor === c ? `0 0 0 2px ${c}` : 'none',
                    }}
                  />
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {AVAILABLE_ICON_NAMES.slice(0, 12).map(ic => {
                  const Ic = getIcon(ic);
                  return (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setGoalIcon(ic)}
                      style={{
                        padding: '8px',
                        borderRadius: 'var(--radius-sm)',
                        background: goalIcon === ic ? `${goalColor}25` : 'var(--bg-tertiary)',
                        color: goalIcon === ic ? goalColor : 'var(--text-muted)',
                        border: goalIcon === ic ? `1px solid ${goalColor}` : '1px solid transparent',
                        flexShrink: 0,
                      }}
                    >
                      <Ic size={18} />
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent-primary)',
                color: 'white',
                fontWeight: 600,
                marginTop: '4px',
              }}
            >
              Сохранить
            </button>
          </form>
        </div>
      )}

      {/* ─── MODAL: ADJUST GOAL (DEPOSIT / WITHDRAW) ─── */}
      {adjustGoal && (
        <div
          onClick={() => setAdjustGoal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px',
          }}
        >
          <form
            onSubmit={handleConfirmGoalAdjust}
            onClick={e => e.stopPropagation()}
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '20px',
              background: 'var(--bg-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>
                {adjustMode === 'deposit' ? 'Пополнить копилку' : 'Снять из копилки'} «{adjustGoal.name}»
              </h3>
              <button type="button" onClick={() => setAdjustGoal(null)} style={{ color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <input
              type="text"
              inputMode="decimal"
              placeholder={`Сумма (${adjustGoal.currency})`}
              value={adjustAmount}
              onChange={e => setAdjustAmount(formatInputNumber(e.target.value))}
              autoFocus
              required
            />

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={syncWithAccount}
                onChange={e => setSyncWithAccount(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <span>Провести операцию по реальному счёту</span>
            </label>

            {syncWithAccount && accounts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <Wallet size={14} />
                  <span>{adjustMode === 'deposit' ? 'Списать со счёта:' : 'Зачислить на счёт:'}</span>
                </div>
                <select
                  value={selectedAccountId}
                  onChange={e => setSelectedAccountId(e.target.value)}
                  style={{
                    padding: '8px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency || 'UZS'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              type="submit"
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: adjustMode === 'deposit' ? 'var(--success)' : 'var(--accent-primary)',
                color: 'white',
                fontWeight: 600,
              }}
            >
              Подтвердить
            </button>
          </form>
        </div>
      )}

      {/* ─── MODAL: CREATE DEBT ─── */}
      {isDebtModalOpen && (
        <div
          onClick={() => setIsDebtModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px',
          }}
        >
          <form
            onSubmit={handleSaveDebt}
            onClick={e => e.stopPropagation()}
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '420px',
              padding: '20px',
              background: 'var(--bg-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Новый долг / заём</h3>
              <button type="button" onClick={() => setIsDebtModalOpen(false)} style={{ color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setDebtType('lent')}
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  background: debtType === 'lent' ? 'var(--success)' : 'var(--bg-tertiary)',
                  color: debtType === 'lent' ? 'white' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                Мне должны
              </button>
              <button
                type="button"
                onClick={() => setDebtType('borrowed')}
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  background: debtType === 'borrowed' ? 'var(--danger)' : 'var(--bg-tertiary)',
                  color: debtType === 'borrowed' ? 'white' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                Я должен
              </button>
            </div>

            <input
              type="text"
              placeholder="Имя контакта / организации"
              value={personName}
              onChange={e => setPersonName(e.target.value)}
              required
            />

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Сумма долга"
                value={debtTotal}
                onChange={e => setDebtTotal(formatInputNumber(e.target.value))}
                required
                style={{ flex: 1 }}
              />
              <select
                value={debtCurrency}
                onChange={e => setDebtCurrency(e.target.value as Currency)}
                style={{
                  padding: '0 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  fontWeight: 600,
                }}
              >
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <div>
              <label className="text-muted" style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                Дата возврата (необязательно)
              </label>
              <input type="date" value={debtDueDate} onChange={e => setDebtDueDate(e.target.value)} style={{ width: '100%' }} />
            </div>

            <input
              type="text"
              placeholder="Комментарий"
              value={debtNote}
              onChange={e => setDebtNote(e.target.value)}
            />

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={debtCreateSyncAccount}
                onChange={e => setDebtCreateSyncAccount(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <span>Отразить выдачу/получение средств на счёте</span>
            </label>

            {debtCreateSyncAccount && accounts.length > 0 && (
              <select
                value={debtAccountId}
                onChange={e => setDebtAccountId(e.target.value)}
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency || 'UZS'})
                  </option>
                ))}
              </select>
            )}

            <button
              type="submit"
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent-primary)',
                color: 'white',
                fontWeight: 600,
              }}
            >
              Сохранить
            </button>
          </form>
        </div>
      )}

      {/* ─── MODAL: REPAY DEBT ─── */}
      {repayDebt && (
        <div
          onClick={() => setRepayDebt(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px',
          }}
        >
          <form
            onSubmit={handleConfirmRepay}
            onClick={e => e.stopPropagation()}
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '400px',
              padding: '20px',
              background: 'var(--bg-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>
                Погашение долга ({repayDebt.personName})
              </h3>
              <button type="button" onClick={() => setRepayDebt(null)} style={{ color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <input
              type="text"
              inputMode="decimal"
              placeholder={`Сумма возврата (${repayDebt.currency})`}
              value={repayAmount}
              onChange={e => setRepayAmount(formatInputNumber(e.target.value))}
              autoFocus
              required
            />

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={repaySyncAccount}
                onChange={e => setRepaySyncAccount(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              <span>
                {repayDebt.type === 'lent' ? 'Зачислить возврат на счёт' : 'Списать погашение со счёта'}
              </span>
            </label>

            {repaySyncAccount && accounts.length > 0 && (
              <select
                value={repayAccountId}
                onChange={e => setRepayAccountId(e.target.value)}
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency || 'UZS'})
                  </option>
                ))}
              </select>
            )}

            <button
              type="submit"
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--success)',
                color: 'white',
                fontWeight: 600,
              }}
            >
              Подтвердить погашение
            </button>
          </form>
        </div>
      )}

      {/* ─── MODAL: CREATE SUBSCRIPTION ─── */}
      {isSubModalOpen && (
        <div
          onClick={() => setIsSubModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '16px',
          }}
        >
          <form
            onSubmit={handleSaveSub}
            onClick={e => e.stopPropagation()}
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '420px',
              padding: '20px',
              background: 'var(--bg-secondary)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Новый регулярный платёж</h3>
              <button type="button" onClick={() => setIsSubModalOpen(false)} style={{ color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setSubType('expense');
                  const c = categories.find(ct => ct.type === 'expense');
                  if (c) setSubCategoryId(c.id);
                }}
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  background: subType === 'expense' ? 'var(--danger)' : 'var(--bg-tertiary)',
                  color: subType === 'expense' ? 'white' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                Расход / Подписка
              </button>
              <button
                type="button"
                onClick={() => {
                  setSubType('income');
                  const c = categories.find(ct => ct.type === 'income');
                  if (c) setSubCategoryId(c.id);
                }}
                style={{
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  background: subType === 'income' ? 'var(--success)' : 'var(--bg-tertiary)',
                  color: subType === 'income' ? 'white' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                Регулярный доход
              </button>
            </div>

            <input
              type="text"
              placeholder="Название (напр., Интернет, Аренда, Зарплата)"
              value={subName}
              onChange={e => setSubName(e.target.value)}
              required
            />

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Сумма"
                value={subAmount}
                onChange={e => setSubAmount(formatInputNumber(e.target.value))}
                required
                style={{ flex: 1 }}
              />
              <select
                value={subCurrency}
                onChange={e => setSubCurrency(e.target.value as Currency)}
                style={{
                  padding: '0 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  fontWeight: 600,
                }}
              >
                <option value="UZS">UZS</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label className="text-muted" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Периодичность</label>
                <select
                  value={subInterval}
                  onChange={e => setSubInterval(e.target.value as RecurrenceInterval)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <option value="weekly">Еженедельно</option>
                  <option value="monthly">Ежемесячно</option>
                  <option value="yearly">Ежегодно</option>
                </select>
              </div>
              <div>
                <label className="text-muted" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Следующая дата</label>
                <input
                  type="date"
                  value={subNextDate}
                  onChange={e => setSubNextDate(e.target.value)}
                  required
                  style={{ width: '100%', padding: '9px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label className="text-muted" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Категория</label>
                <select
                  value={subCategoryId}
                  onChange={e => setSubCategoryId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {categories
                    .filter(c => c.type === subType)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-muted" style={{ fontSize: '11px', display: 'block', marginBottom: '4px' }}>Счёт списания</label>
                <select
                  value={subAccountId}
                  onChange={e => setSubAccountId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              style={{
                padding: '12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent-primary)',
                color: 'white',
                fontWeight: 600,
              }}
            >
              Сохранить
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
