import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { getIcon } from '../lib/icons';
import { PieChart, BarChart2, TrendingDown, TrendingUp, Calendar, Brain, Sparkles, Loader2, ChevronDown, ChevronUp, Download, Wallet, Flame, Eye, EyeOff, X } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, isValid, differenceInCalendarDays, subDays, eachDayOfInterval, getDaysInMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getFinancialAdvice, AnalystReport, hasGeminiKey } from '../lib/gemini';
import { useFinancialStrategy } from '../hooks/useFinancialStrategy';

const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('ru-RU').format(Math.round(amount)) + ' ' + currency;
};

// ── SVG Donut Chart ────────────────────────────────────────────────────────
interface DonutSlice { color: string; percentage: number; label: string; }

function DonutChart({ slices, centerTotal }: { slices: DonutSlice[]; centerTotal?: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const cx = 110, cy = 110, r = 78, stroke = 26;
  const circumference = 2 * Math.PI * r;
  let cumulative = 0;

  const paths = slices.map((s, i) => {
    const offset = circumference - (s.percentage / 100) * circumference;
    const rotation = (cumulative / 100) * 360 - 90;
    cumulative += s.percentage;
    return (
      <circle key={i} cx={cx} cy={cy} r={r} fill="none"
        stroke={s.color}
        strokeWidth={hovered === i ? stroke + 4 : stroke}
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={offset}
        strokeLinecap="butt"
        style={{ transform: `rotate(${rotation}deg)`, transformOrigin: `${cx}px ${cy}px`, transition: 'stroke-width 0.2s ease', cursor: 'pointer' }}
        onMouseEnter={() => setHovered(i)}
        onMouseLeave={() => setHovered(null)}
      />
    );
  });

  const hoveredSlice = hovered !== null ? slices[hovered] : null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
      <svg width={220} height={220} style={{ overflow: 'visible' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-tertiary)" strokeWidth={stroke} />
        {paths}
        {hoveredSlice ? (
          <>
            <text x={cx} y={cy - 10} textAnchor="middle" fill="var(--text-primary)" fontSize="13" fontWeight="600">
              {hoveredSlice.label.length > 12 ? hoveredSlice.label.slice(0, 12) + '…' : hoveredSlice.label}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" fill={hoveredSlice.color} fontSize="20" fontWeight="700">
              {hoveredSlice.percentage.toFixed(1)}%
            </text>
          </>
        ) : centerTotal ? (
          <>
            <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--text-muted)" fontSize="11">Всего</text>
            <text x={cx} y={cy + 13} textAnchor="middle" fill="var(--text-primary)" fontSize="13" fontWeight="700">
              {centerTotal}
            </text>
          </>
        ) : (
          <text x={cx} y={cy + 7} textAnchor="middle" fill="var(--text-muted)" fontSize="13">Всего</text>
        )}
      </svg>
    </div>
  );
}

// ── SVG Daily Trend Chart ──────────────────────────────────────────────────
interface DailyPoint { dateStr: string; label: string; amount: number; }

function DailyTrendChart({ data, color }: { data: DailyPoint[]; color: string }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  if (data.length === 0) return null;

  const maxAmount = Math.max(...data.map(d => d.amount), 1);
  const activePoint = activeIdx !== null ? data[activeIdx] : data.reduce((best, cur) => (cur.amount > best.amount ? cur : best), data[0]);

  return (
    <div className="glass-panel" style={{ padding: '16px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', fontWeight: 600 }}>Динамика по дням</span>
        {activePoint && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {activeIdx !== null ? 'Выбрано' : 'Пик'} ({activePoint.label}):{' '}
            <b style={{ color: 'var(--text-primary)' }}>{formatCurrency(activePoint.amount, 'UZS')}</b>
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: data.length > 20 ? '3px' : '6px', height: '100px', paddingTop: '10px' }}>
        {data.map((pt, idx) => {
          const heightPct = maxAmount > 0 ? Math.max(pt.amount > 0 ? 6 : 2, (pt.amount / maxAmount) * 100) : 2;
          const isSelected = activeIdx === idx;
          return (
            <div
              key={pt.dateStr}
              onMouseEnter={() => setActiveIdx(idx)}
              onMouseLeave={() => setActiveIdx(null)}
              onClick={() => setActiveIdx(activeIdx === idx ? null : idx)}
              style={{
                flex: 1,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                alignItems: 'center',
                cursor: 'pointer',
                minWidth: 0
              }}
              title={`${pt.label}: ${formatCurrency(pt.amount, 'UZS')}`}
            >
              <div
                style={{
                  width: '100%',
                  height: `${heightPct}%`,
                  background: pt.amount === 0 ? 'var(--bg-tertiary)' : color,
                  opacity: activeIdx === null || isSelected ? 1 : 0.45,
                  borderRadius: '3px 3px 1px 1px',
                  transition: 'height 0.3s ease, opacity 0.15s ease'
                }}
              />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '10px', color: 'var(--text-muted)' }}>
        <span>{data[0]?.label}</span>
        {data.length > 2 && <span>{data[Math.floor(data.length / 2)]?.label}</span>}
        {data.length > 1 && <span>{data[data.length - 1]?.label}</span>}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function Analytics() {
  const { transactions: storeTransactions, categories, accounts, goals, debts, subscriptions } = useStore();
  const navigate = useNavigate();

  const { strategyId, currentStrategy: strategy, personalInstructions } = useFinancialStrategy();

  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Hidden categories for temporary or persistent exclusion from analytics
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('analytics_hidden_categories');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleHideCategory = (catId: string) => {
    setHiddenCategoryIds(prev => {
      const next = prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId];
      try {
        localStorage.setItem('analytics_hidden_categories', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const resetHiddenCategories = () => {
    setHiddenCategoryIds([]);
    try {
      localStorage.removeItem('analytics_hidden_categories');
    } catch {}
  };

  // Extract all unique tags
  const allTags = useMemo(
    () => Array.from(new Set(storeTransactions.flatMap(t => t.tags || []))),
    [storeTransactions]
  );

  // AI State
  const [aiReport, setAiReport] = useState<AnalystReport | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [isAiExpanded, setIsAiExpanded] = useState(false);

  const handleMonthSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val) {
      const [year, month] = val.split('-');
      const d = new Date(parseInt(year), parseInt(month) - 1, 1);
      setStartDate(format(startOfMonth(d), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(d), 'yyyy-MM-dd'));
    }
  };

  const excludedAccountIds = useMemo(() => {
    return new Set(
      accounts
        .filter(a => a.excludeFromStats || a.name.trim().toLowerCase().includes('недостача'))
        .map(a => a.id)
    );
  }, [accounts]);

  // Filter out excluded and apply date range + tag filter + hiddenCategoryIds + excluded accounts
  const transactions = storeTransactions.filter(t => {
    if (t.excludeFromStats) return false;
    if (excludedAccountIds.has(t.accountId)) return false;
    if (t.toAccountId && excludedAccountIds.has(t.toAccountId)) return false;
    const cat = categories.find(c => c.id === t.categoryId);
    if (cat?.excludeFromStats) return false;
    if (t.categoryId && hiddenCategoryIds.includes(t.categoryId)) return false;
    if (selectedTag && (!t.tags || !t.tags.includes(selectedTag))) return false;

    const tDate = new Date(t.date);

    if (startDate) {
      const sDate = new Date(startDate);
      if (isValid(sDate) && tDate < startOfDay(sDate)) return false;
    }
    if (endDate) {
      const eDate = new Date(endDate);
      if (isValid(eDate) && tDate > endOfDay(eDate)) return false;
    }

    return true;
  });

  // ── Previous Period (MoM) calculation ────────────────────────────────────
  const prevPeriodStats = useMemo(() => {
    if (!startDate || !endDate) return null;
    const sDate = startOfDay(new Date(startDate));
    const eDate = endOfDay(new Date(endDate));
    if (!isValid(sDate) || !isValid(eDate) || eDate < sDate) return null;

    const daysSpan = Math.max(1, differenceInCalendarDays(eDate, sDate) + 1);
    const prevEnd = endOfDay(subDays(sDate, 1));
    const prevStart = startOfDay(subDays(sDate, daysSpan));

    let prevExpenseTotal = 0;
    let prevIncomeTotal = 0;
    const prevByCategory: Record<string, number> = {};

    for (const t of storeTransactions) {
      if (t.excludeFromStats) continue;
      if (excludedAccountIds.has(t.accountId)) continue;
      if (t.toAccountId && excludedAccountIds.has(t.toAccountId)) continue;
      const cat = categories.find(c => c.id === t.categoryId);
      if (cat?.excludeFromStats) continue;
      if (t.categoryId && hiddenCategoryIds.includes(t.categoryId)) continue;
      if (selectedTag && (!t.tags || !t.tags.includes(selectedTag))) continue;

      const d = new Date(t.date);
      if (d < prevStart || d > prevEnd) continue;

      const amtUZS = t.currency === 'UZS'
        ? t.amount
        : (t.convertedAmount ?? (t.exchangeRate ? t.amount * t.exchangeRate : 0));

      if (t.type === 'expense') {
        prevExpenseTotal += amtUZS;
        prevByCategory[t.categoryId] = (prevByCategory[t.categoryId] || 0) + amtUZS;
      } else if (t.type === 'income') {
        prevIncomeTotal += amtUZS;
        prevByCategory[t.categoryId] = (prevByCategory[t.categoryId] || 0) + amtUZS;
      }
    }

    return { prevExpenseTotal, prevIncomeTotal, prevByCategory };
  }, [storeTransactions, categories, startDate, endDate, selectedTag, hiddenCategoryIds, excludedAccountIds]);

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [chartMode, setChartMode] = useState<'donut' | 'bar'>('donut');
  const [isExpensesExpanded, setIsExpensesExpanded] = useState(false);

  // ── Calculate totals for hidden categories in current period (for display/unhide) ──
  const hiddenCategoriesData = useMemo(() => {
    if (hiddenCategoryIds.length === 0) return [];

    const hiddenTxs = storeTransactions.filter(t => {
      if (t.excludeFromStats) return false;
      if (excludedAccountIds.has(t.accountId)) return false;
      if (t.toAccountId && excludedAccountIds.has(t.toAccountId)) return false;
      if (!t.categoryId || !hiddenCategoryIds.includes(t.categoryId)) return false;
      if (t.type !== type) return false;

      const tDate = new Date(t.date);
      if (startDate) {
        const sDate = new Date(startDate);
        if (isValid(sDate) && tDate < startOfDay(sDate)) return false;
      }
      if (endDate) {
        const eDate = new Date(endDate);
        if (isValid(eDate) && tDate > endOfDay(eDate)) return false;
      }
      return true;
    });

    const totals: Record<string, number> = {};
    for (const t of hiddenTxs) {
      const amtUZS = t.currency === 'UZS'
        ? t.amount
        : (t.convertedAmount ?? (t.exchangeRate ? t.amount * t.exchangeRate : 0));
      totals[t.categoryId] = (totals[t.categoryId] || 0) + amtUZS;
    }

    return hiddenCategoryIds
      .map(id => {
        const cat = categories.find(c => c.id === id);
        return {
          category: cat,
          amount: totals[id] || 0,
        };
      })
      .filter(item => Boolean(item.category));
  }, [storeTransactions, categories, hiddenCategoryIds, type, startDate, endDate, excludedAccountIds]);

  // ── Expense calculations ─────────────────────────────────────────────────
  const expenseTxs = transactions.filter(t => t.type === 'expense');

  // Regular UZS expenses (not from USD card)
  const regularUZSExpenses = expenseTxs
    .filter(t => t.currency === 'UZS')
    .reduce((acc, t) => acc + t.amount, 0);

  // USD expenses converted to UZS
  const usdExpensesInUZS = expenseTxs
    .filter(t => t.currency === 'USD')
    .reduce((acc, t) => {
      return acc + (t.convertedAmount ?? (t.exchangeRate ? t.amount * t.exchangeRate : 0));
    }, 0);

  // Transfers from USD to UZS cards (taking cash out of USD pool)
  const usdToUzsTransfersInUZS = transactions
    .filter(t => t.type === 'transfer' && t.currency === 'USD' && t.convertedAmount)
    .reduce((acc, t) => acc + (t.convertedAmount ?? 0), 0);

  const totalUsdSpentInUZS = usdExpensesInUZS + usdToUzsTransfersInUZS;

  // Total UZS expenses = regular + USD spent (in UZS equivalent)
  const totalUZSExpenses = regularUZSExpenses + usdExpensesInUZS;

  // Currency purchase pool: UZS→USD transfers with addToExpenses flag
  const usdPurchasePoolTotal = transactions
    .filter(t => t.type === 'transfer' && t.addToExpenses === true && t.currency === 'UZS')
    .reduce((acc, t) => acc + t.amount, 0);

  // Remaining pool = purchased - already spent from USD (including transfers back to UZS)
  const usdPoolRemaining = Math.max(0, usdPurchasePoolTotal - totalUsdSpentInUZS);
  const hasUsdPool = usdPurchasePoolTotal > 0;

  // Grand total expenses
  const grandTotal = totalUZSExpenses + usdPoolRemaining;

  // ── Income calculations ──────────────────────────────────────────────────
  const incomeTxs = transactions.filter(t => t.type === 'income');

  const regularUZSIncome = incomeTxs
    .filter(t => t.currency === 'UZS')
    .reduce((acc, t) => acc + t.amount, 0);

  const usdIncomeInUZS = incomeTxs
    .filter(t => t.currency === 'USD')
    .reduce((acc, t) => acc + (t.convertedAmount ?? (t.exchangeRate ? t.amount * t.exchangeRate : 0)), 0);

  const totalUSDIncome = incomeTxs
    .filter(t => t.currency === 'USD')
    .reduce((acc, t) => acc + t.amount, 0);

  const totalIncomeUZS = regularUZSIncome + usdIncomeInUZS;

  // Net Balance (Сальдо / Дельта за период)
  const netBalance = totalIncomeUZS - grandTotal;

  // MoM Deltas
  const expenseMomPct = prevPeriodStats && prevPeriodStats.prevExpenseTotal > 0
    ? ((grandTotal - prevPeriodStats.prevExpenseTotal) / prevPeriodStats.prevExpenseTotal) * 100
    : null;
  const incomeMomPct = prevPeriodStats && prevPeriodStats.prevIncomeTotal > 0
    ? ((totalIncomeUZS - prevPeriodStats.prevIncomeTotal) / prevPeriodStats.prevIncomeTotal) * 100
    : null;

  // ── Burn Rate & End of Month Forecast ────────────────────────────────────
  const burnRateStats = useMemo(() => {
    if (!startDate || !endDate) return null;
    const sDate = startOfDay(new Date(startDate));
    const eDate = endOfDay(new Date(endDate));
    if (!isValid(sDate) || !isValid(eDate) || eDate < sDate) return null;

    const now = new Date();
    const effectiveEnd = now < eDate ? now : eDate;
    const elapsedDays = Math.max(1, differenceInCalendarDays(effectiveEnd, sDate) + 1);
    const avgDailyExpense = grandTotal / elapsedDays;
    const totalDaysInSelectedMonth = getDaysInMonth(sDate);
    const isCurrentMonthPeriod =
      startDate === format(startOfMonth(now), 'yyyy-MM-dd') &&
      endDate === format(endOfMonth(now), 'yyyy-MM-dd');
    const projectedMonthExpense = isCurrentMonthPeriod
      ? avgDailyExpense * totalDaysInSelectedMonth
      : null;

    const totalMonthlyBudget = categories
      .filter(c => c.type === 'expense' && (c.monthlyBudgetUZS || 0) > 0)
      .reduce((sum, c) => sum + (c.monthlyBudgetUZS || 0), 0);

    return {
      elapsedDays,
      avgDailyExpense,
      projectedMonthExpense,
      totalMonthlyBudget,
    };
  }, [startDate, endDate, grandTotal, categories]);

  // ── Daily Trend Data ─────────────────────────────────────────────────────
  const dailyTrendData: DailyPoint[] = useMemo(() => {
    if (!startDate || !endDate) return [];
    const sDate = startOfDay(new Date(startDate));
    const eDate = endOfDay(new Date(endDate));
    if (!isValid(sDate) || !isValid(eDate) || eDate < sDate) return [];
    if (differenceInCalendarDays(eDate, sDate) > 62) return []; // Skip daily bars for very long multi-month ranges

    const days = eachDayOfInterval({ start: sDate, end: eDate });
    const totalsByDay: Record<string, number> = {};

    const sourceTxs = type === 'expense' ? expenseTxs : incomeTxs;
    for (const t of sourceTxs) {
      const dayKey = format(new Date(t.date), 'yyyy-MM-dd');
      const amtUZS = t.currency === 'UZS'
        ? t.amount
        : (t.convertedAmount ?? (t.exchangeRate ? t.amount * t.exchangeRate : 0));
      totalsByDay[dayKey] = (totalsByDay[dayKey] || 0) + amtUZS;
    }

    return days.map(d => {
      const key = format(d, 'yyyy-MM-dd');
      return {
        dateStr: key,
        label: format(d, 'd MMM', { locale: ru }),
        amount: totalsByDay[key] || 0,
      };
    });
  }, [startDate, endDate, type, expenseTxs, incomeTxs]);

  // Group incomes by account
  const accountIncomeMap: Record<string, { uzs: number; usd: number }> = {};
  incomeTxs.forEach(t => {
    const accId = t.accountId;
    if (!accountIncomeMap[accId]) accountIncomeMap[accId] = { uzs: 0, usd: 0 };
    if (t.currency === 'USD') {
      accountIncomeMap[accId].usd += t.amount;
    } else {
      accountIncomeMap[accId].uzs += t.amount;
    }
  });

  const incomeByAccounts = Object.entries(accountIncomeMap).map(([accId, totals]) => {
    const acc = accounts.find(a => a.id === accId);
    return {
      id: accId,
      name: acc?.name || 'Счет',
      currency: acc?.currency || 'UZS',
      totalUZS: totals.uzs,
      totalUSD: totals.usd
    };
  }).filter(a => a.totalUZS > 0 || a.totalUSD > 0);

  // ── Category analytics ────────────────────────────────────────────────────
  const filteredTx = transactions.filter(t => t.type === type);

  const categoryTotals: Record<string, number> = {};
  filteredTx.forEach(t => {
    const amountInUZS = t.currency === 'UZS' 
      ? t.amount 
      : (t.convertedAmount ?? (t.exchangeRate ? t.amount * t.exchangeRate : 0));
    categoryTotals[t.categoryId] = (categoryTotals[t.categoryId] || 0) + amountInUZS;
  });

  const totalCategorizedAmount = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);

  const sortedCategories = Object.entries(categoryTotals)
    .map(([id, amount]) => {
      const prevAmt = prevPeriodStats?.prevByCategory[id] || 0;
      const momPct = prevAmt > 0 ? ((amount - prevAmt) / prevAmt) * 100 : null;
      return {
        category: categories.find(c => c.id === id),
        amount,
        percentage: totalCategorizedAmount > 0 ? (amount / totalCategorizedAmount) * 100 : 0,
        momPct,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  const donutSlices: DonutSlice[] = sortedCategories.map(item => ({
    color: item.category?.color || (type === 'income' ? 'var(--success)' : 'var(--accent-primary)'),
    percentage: item.percentage,
    label: item.category?.name || 'Неизвестно',
  }));

  // Generate AI Report handler
  const handleGenerateReport = async () => {
    setIsAiLoading(true);
    setAiError('');
    setIsAiExpanded(true);
    
    try {
      const incCatTotals: Record<string, number> = {};
      incomeTxs.forEach(t => {
        const amt = t.currency === 'UZS' ? t.amount : (t.convertedAmount || (t.exchangeRate ? t.amount * t.exchangeRate : 0));
        incCatTotals[t.categoryId] = (incCatTotals[t.categoryId] || 0) + amt;
      });
      const incomesByCategory = Object.entries(incCatTotals).map(([id, amt]) => ({
        category: categories.find(c => c.id === id)?.name || 'Неизвестно',
        amount: amt,
        percentage: totalIncomeUZS > 0 ? Number(((amt / totalIncomeUZS) * 100).toFixed(1)) : 0
      })).sort((a,b) => b.amount - a.amount);

      // Aggregate expenses
      const totalCategorizedExpenses = expenseTxs.reduce((acc, t) => acc + (t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0)), 0);
      const expCatTotals: Record<string, number> = {};
      expenseTxs.forEach(t => {
        const amt = t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0);
        expCatTotals[t.categoryId] = (expCatTotals[t.categoryId] || 0) + amt;
      });
      const expensesByCategory = Object.entries(expCatTotals).map(([id, amt]) => ({
        category: categories.find(c => c.id === id)?.name || 'Неизвестно',
        amount: amt,
        percentage: totalCategorizedExpenses > 0 ? Number(((amt / totalCategorizedExpenses) * 100).toFixed(1)) : 0
      })).sort((a,b) => b.amount - a.amount);

      const categoryBudgets = categories
        .filter(c => c.type === 'expense' && (c.monthlyBudgetUZS || 0) > 0)
        .map(c => {
          const spent = expCatTotals[c.id] || 0;
          const limit = c.monthlyBudgetUZS || 0;
          return {
            category: c.name,
            spent,
            limit,
            pct: limit > 0 ? Math.round((spent / limit) * 100) : 0,
          };
        });

      const goalsSummary = {
        count: goals.length,
        totalSavedUZS: goals.filter(g => g.currency === 'UZS').reduce((s, g) => s + g.currentAmount, 0),
        totalTargetUZS: goals.filter(g => g.currency === 'UZS').reduce((s, g) => s + g.targetAmount, 0),
      };

      const debtsSummary = {
        lentUZS: debts.filter(d => !d.isSettled && d.type === 'lent' && d.currency === 'UZS').reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0),
        borrowedUZS: debts.filter(d => !d.isSettled && d.type === 'borrowed' && d.currency === 'UZS').reduce((s, d) => s + Math.max(0, d.totalAmount - d.paidAmount), 0),
      };

      const monthlySubscriptionsUZS = Math.round(
        subscriptions
          .filter(s => s.isActive && s.type === 'expense' && s.currency === 'UZS')
          .reduce((acc, s) => {
            if (s.interval === 'weekly') return acc + s.amount * 4.33;
            if (s.interval === 'yearly') return acc + s.amount / 12;
            return acc + s.amount;
          }, 0)
      );

      const statsData = {
        totalExpenses: grandTotal,
        categorizedExpensesTotal: totalCategorizedExpenses,
        totalIncome: totalIncomeUZS,
        expensesByCategory,
        incomesByCategory,
        usdPoolRemaining,
        categoryBudgets,
        burnRate: burnRateStats,
        goalsSummary,
        debtsSummary,
        monthlySubscriptionsUZS,
      };

      const report = await getFinancialAdvice(statsData, strategyId, personalInstructions);
      setAiReport(report);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      if (errorMessage.includes('429') || errorMessage.includes('limit: 0')) {
        setAiError('Бесплатный лимит недоступен (limit: 0). Пожалуйста, обновите ваш ключ или регион.');
      } else {
        setAiError('Ошибка API: ' + (errorMessage || 'Не удалось составить отчет.'));
      }
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleDownloadReport = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!aiReport) return;

    const reportText = `ФИНАНСОВЫЙ AI-ОТЧЕТ
Период: ${startDate ? format(new Date(startDate), 'dd.MM.yyyy') : '...'} — ${endDate ? format(new Date(endDate), 'dd.MM.yyyy') : '...'}

РЕЗЮМЕ:
${aiReport.summary}

НАБЛЮДЕНИЯ:
${aiReport.insights.map(i => '• ' + i).join('\n')}

СОВЕТЫ:
${aiReport.advice.map(a => '• ' + a).join('\n')}
    `.trim();

    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-report-${format(new Date(), 'yyyy-MM-dd')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-content animate-fade-in">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2>Статистика</h2>
        <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '3px', gap: '2px' }}>
          <button id="chart-donut-btn" onClick={() => setChartMode('donut')} title="Круговая диаграмма"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: 'var(--radius-sm)', background: chartMode === 'donut' ? 'var(--accent-primary)' : 'transparent', color: chartMode === 'donut' ? '#fff' : 'var(--text-muted)', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
            <PieChart size={16} />
          </button>
          <button id="chart-bar-btn" onClick={() => setChartMode('bar')} title="Прямые полосы"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: 'var(--radius-sm)', background: chartMode === 'bar' ? 'var(--accent-primary)' : 'transparent', color: chartMode === 'bar' ? '#fff' : 'var(--text-muted)', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
            <BarChart2 size={16} />
          </button>
        </div>
      </div>

      {/* ── Summary Card: Приход, Расход, Сальдо ── */}
      <div className="glass-panel" style={{ padding: '16px 12px', marginBottom: '14px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', textAlign: 'center' }}>
        <div style={{ padding: '4px' }}>
          <p className="text-muted" style={{ fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Приход</p>
          <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--success)', margin: 0, wordBreak: 'break-word' }}>
            +{formatCurrency(totalIncomeUZS, '')}
          </p>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>UZS</span>
          {incomeMomPct !== null && (
            <div style={{ fontSize: '10px', fontWeight: 600, marginTop: '3px', color: incomeMomPct >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {incomeMomPct >= 0 ? '+' : ''}{incomeMomPct.toFixed(0)}% к прошл.
            </div>
          )}
        </div>
        <div style={{ padding: '4px', borderLeft: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)' }}>
          <p className="text-muted" style={{ fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Расход</p>
          <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--danger)', margin: 0, wordBreak: 'break-word' }}>
            -{formatCurrency(grandTotal, '')}
          </p>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>UZS</span>
          {expenseMomPct !== null && (
            <div style={{ fontSize: '10px', fontWeight: 600, marginTop: '3px', color: expenseMomPct <= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {expenseMomPct >= 0 ? '+' : ''}{expenseMomPct.toFixed(0)}% к прошл.
            </div>
          )}
        </div>
        <div style={{ padding: '4px' }}>
          <p className="text-muted" style={{ fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Сальдо</p>
          <p style={{ 
            fontSize: '14px', 
            fontWeight: 700, 
            color: netBalance >= 0 ? 'var(--success)' : 'var(--danger)', 
            margin: 0,
            wordBreak: 'break-word'
          }}>
            {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance, '')}
          </p>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>UZS</span>
        </div>
      </div>

      {/* Expense / Income toggle */}
      <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '4px', marginBottom: '16px' }}>
        <button onClick={() => setType('expense')}
          style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', background: type === 'expense' ? 'var(--bg-secondary)' : 'transparent', color: type === 'expense' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: type === 'expense' ? 600 : 400, boxShadow: type === 'expense' ? 'var(--shadow-sm)' : 'none', border: 'none', cursor: 'pointer' }}>
          Расходы
        </button>
        <button onClick={() => setType('income')}
          style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', background: type === 'income' ? 'var(--bg-secondary)' : 'transparent', color: type === 'income' ? 'var(--success)' : 'var(--text-muted)', fontWeight: type === 'income' ? 600 : 400, boxShadow: type === 'income' ? 'var(--shadow-sm)' : 'none', border: 'none', cursor: 'pointer' }}>
          Доходы
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        {/* Date Filter Button */}
        <button
          onClick={() => setIsFilterOpen(!isFilterOpen)}
          className="glass-panel"
          style={{
            width: '100%', padding: '12px 16px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', border: '1px solid var(--border-color)',
            cursor: 'pointer',
            borderRadius: isFilterOpen ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
            borderBottom: isFilterOpen ? 'none' : '1px solid var(--border-color)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} color="var(--text-primary)" />
            <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
              {startDate === format(startOfMonth(new Date()), 'yyyy-MM-dd') && endDate === format(endOfMonth(new Date()), 'yyyy-MM-dd')
                ? 'Текущий месяц'
                : `${startDate ? format(new Date(startDate), 'dd.MM.yy') : '...'} - ${endDate ? format(new Date(endDate), 'dd.MM.yy') : '...'}`
              }
            </span>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{isFilterOpen ? 'Скрыть' : 'Изменить'}</span>
        </button>

        {/* Date Filter Accordion */}
        {isFilterOpen && (
          <div className="glass-panel" style={{
            width: '100%', padding: '16px', animation: 'fadeIn 0.2s ease-out',
            borderRadius: '0 0 var(--radius-md) var(--radius-md)',
            borderTop: '1px solid var(--border-color)'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Быстрый выбор месяца</label>
              <input
                type="month"
                className="date-time-input"
                value={startDate ? startDate.substring(0, 7) : ''}
                onChange={handleMonthSelect}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <div style={{ flex: 1 }}>
                <label className="text-muted" style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>С (ручной ввод)</label>
                <input
                  type="date"
                  className="date-time-input"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  style={{ padding: '8px', fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="text-muted" style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>По (ручной ввод)</label>
                <input
                  type="date"
                  className="date-time-input"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  style={{ padding: '8px', fontSize: '14px', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tag Filter Pills */}
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingTop: '10px', paddingBottom: '2px', alignItems: 'center' }}>
            <span className="text-muted" style={{ fontSize: '12px', flexShrink: 0 }}>Тег:</span>
            {allTags.map(tg => {
              const active = selectedTag === tg;
              return (
                <button
                  key={tg}
                  type="button"
                  onClick={() => setSelectedTag(active ? '' : tg)}
                  style={{
                    fontSize: '12px', padding: '4px 10px', borderRadius: '999px', flexShrink: 0,
                    background: active ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                    color: active ? '#fff' : 'var(--text-muted)',
                    border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                    fontWeight: active ? 600 : 400, cursor: 'pointer'
                  }}
                >
                  #{tg}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Hidden Categories Active Banner ── */}
      {hiddenCategoryIds.length > 0 && (
        <div
          className="glass-panel"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            padding: '10px 14px',
            marginBottom: '16px',
            fontSize: '13px',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <EyeOff size={16} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <span style={{ fontWeight: 500 }}>
              Исключено из расчёта:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {hiddenCategoryIds.map(id => {
                const cat = categories.find(c => c.id === id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleHideCategory(id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      fontWeight: 500,
                    }}
                    title="Нажмите, чтобы вернуть в расчёт"
                  >
                    <span>{cat?.name || 'Категория'}</span>
                    <X size={12} style={{ color: 'var(--text-muted)' }} />
                  </button>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={resetHiddenCategories}
            style={{
              fontSize: '12px',
              color: 'var(--accent-primary)',
              fontWeight: 600,
              padding: '4px 8px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Показать все
          </button>
        </div>
      )}

      {/* ── Summary cards depending on tab ── */}
      {type === 'expense' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>

          {/* Main Card: Grand total (always visible) */}
          <div
            className="glass-panel"
            onClick={() => hasUsdPool && setIsExpensesExpanded(!isExpensesExpanded)}
            style={{
              padding: '18px 20px',
              background: hasUsdPool ? 'rgba(79,70,229,0.05)' : 'var(--glass-bg)',
              cursor: hasUsdPool ? 'pointer' : 'default',
              transition: 'background 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingDown size={16} style={{ color: 'var(--danger)' }} />
                <p className="text-muted" style={{ fontSize: '13px' }}>Общие расходы</p>
              </div>
              {hasUsdPool && (
                <span className="text-muted" style={{ fontSize: '12px', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '10px' }}>
                  {isExpensesExpanded ? 'Скрыть детали ↑' : 'Показать детали ↓'}
                </span>
              )}
            </div>
            <h3 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {formatCurrency(grandTotal, 'UZS')}
            </h3>
            {hasUsdPool && (
              <p className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>
                UZS {formatCurrency(totalUZSExpenses, '')} + Пул USD {formatCurrency(usdPoolRemaining, '')}
              </p>
            )}
          </div>

          {/* Burn Rate & End of Month Forecast Card */}
          {burnRateStats && grandTotal > 0 && (
            <div className="glass-panel" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Flame size={16} color="#f59e0b" />
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Темп расходов ({burnRateStats.elapsedDays} дн.)</span>
                </div>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  ~{formatCurrency(burnRateStats.avgDailyExpense, 'UZS')} / день
                </span>
              </div>
              {burnRateStats.projectedMonthExpense !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>Прогноз к концу месяца:</span>
                  <b style={{
                    color: burnRateStats.totalMonthlyBudget > 0 && burnRateStats.projectedMonthExpense > burnRateStats.totalMonthlyBudget
                      ? 'var(--danger)'
                      : 'var(--text-primary)'
                  }}>
                    ~{formatCurrency(burnRateStats.projectedMonthExpense, 'UZS')}
                  </b>
                </div>
              )}
              {burnRateStats.totalMonthlyBudget > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                  <span>Суммарный лимит по категориям:</span>
                  <b>{formatCurrency(burnRateStats.totalMonthlyBudget, 'UZS')}</b>
                </div>
              )}
            </div>
          )}

          {/* Collapsible details wrapper */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '10px',
            overflow: 'hidden', padding: isExpensesExpanded ? '2px' : '0 2px',
            transition: 'max-height 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease',
            maxHeight: isExpensesExpanded ? '500px' : '0px',
            opacity: isExpensesExpanded ? 1 : 0
          }}>
            {/* Detailed Card 1: UZS expenses */}
            <div
              onClick={() => navigate('/history?type=expense&currency=UZS')}
              style={{
                padding: '16px 20px', borderLeft: '4px solid var(--accent-primary)',
                background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', borderTop: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)'
              }}
            >
              <p className="text-muted" style={{ fontSize: '13px', marginBottom: '4px' }}>Обычные расходы (UZS)</p>
              <h3 style={{ fontSize: '22px', fontWeight: 700 }}>
                {formatCurrency(totalUZSExpenses, 'UZS')}
              </h3>
              {usdExpensesInUZS > 0 && (
                <p className="text-muted" style={{ fontSize: '12px', marginTop: '4px' }}>
                  в т.ч. оплачено с USD-счетов: {formatCurrency(usdExpensesInUZS, 'UZS')}
                </p>
              )}
            </div>

            {/* Detailed Card 2: USD pool (shown only if any transfer with addToExpenses) */}
            {hasUsdPool && (
              <div
                onClick={() => navigate('/history?pool=true')}
                style={{
                  padding: '16px 20px', borderLeft: '4px solid #8b5cf6',
                  background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', borderTop: '1px solid var(--border-color)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)'
                }}
              >
                <p className="text-muted" style={{ fontSize: '13px', marginBottom: '4px' }}>
                  💱 Пул: Конвертировано в USD
                </p>
                <h3 style={{ fontSize: '22px', fontWeight: 700, color: '#8b5cf6' }}>
                  {formatCurrency(usdPoolRemaining, 'UZS')}
                </h3>
                <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
                  <p className="text-muted" style={{ fontSize: '12px' }}>
                    Всего обменяно: {formatCurrency(usdPurchasePoolTotal, 'UZS')}
                  </p>
                  {totalUsdSpentInUZS > 0 && (
                    <p className="text-muted" style={{ fontSize: '12px' }}>
                      Потрачено: {formatCurrency(totalUsdSpentInUZS, 'UZS')}
                    </p>
                  )}
                </div>
                {/* Mini progress bar: how much spent from pool */}
                <div style={{ marginTop: '10px', width: '100%', height: '4px', background: 'var(--bg-tertiary)', borderRadius: '2px' }}>
                  <div style={{
                    width: `${usdPurchasePoolTotal > 0 ? Math.min(100, (totalUsdSpentInUZS / usdPurchasePoolTotal) * 100) : 0}%`,
                    height: '100%', background: '#8b5cf6', borderRadius: '2px',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Income summary block */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <div className="glass-panel" style={{ padding: '20px', background: 'rgba(34, 197, 94, 0.05)', borderLeft: '4px solid var(--success)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <TrendingUp size={18} style={{ color: 'var(--success)' }} />
              <p className="text-muted" style={{ fontSize: '13px', margin: 0 }}>Всего доходов (эквивалент в UZS)</p>
            </div>
            <h3 style={{ fontSize: '28px', fontWeight: 700, color: 'var(--success)', margin: '4px 0 0' }}>
              +{formatCurrency(totalIncomeUZS, 'UZS')}
            </h3>
            {totalUSDIncome > 0 && (
              <p className="text-muted" style={{ fontSize: '12px', marginTop: '6px', margin: 0 }}>
                в т.ч. в USD: {formatCurrency(totalUSDIncome, 'USD')} ({formatCurrency(usdIncomeInUZS, 'UZS')})
              </p>
            )}
          </div>

          {/* Income by accounts */}
          {incomeByAccounts.length > 0 && (
            <div>
              <p className="text-muted" style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.5px' }}>
                Поступления по картам и счетам
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                {incomeByAccounts.map(acc => (
                  <div key={acc.id} className="glass-panel" style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <Wallet size={14} color="var(--accent-primary)" />
                      <p className="text-muted" style={{ fontSize: '12px', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {acc.name}
                      </p>
                    </div>
                    {acc.totalUZS > 0 && (
                      <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--success)', margin: 0 }}>
                        +{formatCurrency(acc.totalUZS, 'UZS')}
                      </p>
                    )}
                    {acc.totalUSD > 0 && (
                      <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--success)', margin: 0 }}>
                        +{formatCurrency(acc.totalUSD, 'USD')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Daily Trend Bar Chart ── */}
      {dailyTrendData.some(d => d.amount > 0) && (
        <DailyTrendChart
          data={dailyTrendData}
          color={type === 'expense' ? 'var(--accent-primary)' : 'var(--success)'}
        />
      )}

      {/* ── AI Analyst Section ── */}
      <div style={{ marginBottom: '24px' }}>
        <div 
          onClick={() => {
            if (!hasGeminiKey()) return;
            if (!aiReport && !isAiLoading) handleGenerateReport();
            else setIsAiExpanded(!isAiExpanded);
          }}
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(168,85,247,0.15) 100%)',
            border: '1px solid rgba(168,85,247,0.3)',
            borderRadius: isAiExpanded ? 'var(--radius-md) var(--radius-md) 0 0' : 'var(--radius-md)',
            padding: '16px',
            cursor: hasGeminiKey() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            transition: 'all 0.3s ease'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)', padding: '8px', borderRadius: '50%', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Brain size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                AI-Аналитик <Sparkles size={14} color="#a855f7" />
                {hasGeminiKey() && strategy.id !== 'none' && (
                  <span style={{ fontSize: '10px', background: 'rgba(168,85,247,0.15)', color: '#a855f7', padding: '2px 6px', borderRadius: '10px', fontWeight: 500 }}>
                    {strategy.name}
                  </span>
                )}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, marginTop: '2px' }}>
                {hasGeminiKey() ? 'Персональные финансовые советы' : 'Требуется API ключ (в Настройках)'}
              </p>
            </div>
          </div>
          {hasGeminiKey() && (
            <div>
              {isAiLoading ? <Loader2 size={20} className="animate-spin" color="#a855f7" /> : (
                isAiExpanded ? <ChevronUp size={20} color="var(--text-muted)" /> : <ChevronDown size={20} color="var(--text-muted)" />
              )}
            </div>
          )}
        </div>

        {/* AI Report Content */}
        {hasGeminiKey() && isAiExpanded && (
          <div className="glass-panel" style={{
            padding: '16px',
            borderTop: 'none',
            borderRadius: '0 0 var(--radius-md) var(--radius-md)',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            {aiError && (
              <div style={{ padding: '12px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 'var(--radius-sm)', fontSize: '13px' }}>
                {aiError}
              </div>
            )}

            {isAiLoading && (
              <div style={{ padding: '24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <Loader2 size={28} className="animate-spin" color="#a855f7" />
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Анализирую ваши финансы с помощью Gemini...</span>
              </div>
            )}

            {aiReport && !isAiLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.5px' }}>
                    📋 Резюме
                  </h4>
                  <p style={{ fontSize: '14px', lineHeight: 1.5, margin: 0, color: 'var(--text-primary)' }}>
                    {aiReport.summary}
                  </p>
                </div>

                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                    🔍 Наблюдения
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {aiReport.insights.map((item, idx) => (
                      <li key={idx} style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{item}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', letterSpacing: '0.5px' }}>
                    💡 Советы
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {aiReport.advice.map((item, idx) => (
                      <li key={idx} style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{item}</li>
                    ))}
                  </ul>
                </div>

                {aiReport.usageMetadata && (
                  <div style={{
                    marginTop: '4px',
                    padding: '8px 12px',
                    background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px dashed var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      📊 Потребление токенов (Gemini API)
                    </span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-primary)' }}>
                      <span>Входные токены (Prompt):</span>
                      <span style={{ fontWeight: 600 }}>{aiReport.usageMetadata.promptTokenCount}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-primary)' }}>
                      <span>Выходные токены (Completion):</span>
                      <span style={{ fontWeight: 600 }}>{aiReport.usageMetadata.candidatesTokenCount}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', borderTop: '1px solid var(--border-color)', paddingTop: '4px', color: 'var(--text-primary)', marginTop: '2px' }}>
                      <span style={{ fontWeight: 600 }}>Всего токенов (Total):</span>
                      <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{aiReport.usageMetadata.totalTokenCount}</span>
                    </div>
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleGenerateReport(); }}
                    style={{ flex: 1, padding: '8px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', border: '1px solid var(--border-color)' }}
                  >
                    <Sparkles size={12} /> Обновить
                  </button>
                  <button 
                    onClick={handleDownloadReport}
                    style={{ flex: 1, padding: '8px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}
                  >
                    <Download size={12} /> Скачать
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Categories section */}
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
          {type === 'expense' ? 'Траты' : 'Поступления'} по категориям
        </h3>

        {sortedCategories.length === 0 ? (
          <div className="glass-panel" style={{ padding: '32px', textAlign: 'center' }}>
            <p className="text-muted">Нет данных</p>
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: '16px' }}>
            {chartMode === 'donut' && <DonutChart slices={donutSlices} centerTotal={formatCurrency(totalCategorizedAmount, 'UZS')} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {sortedCategories.map(item => {
                const IconComp = getIcon(item.category?.iconName || '');
                const color = item.category?.color || (type === 'income' ? 'var(--success)' : 'var(--accent-primary)');
                const budgetLimit = type === 'expense' ? (item.category?.monthlyBudgetUZS || 0) : 0;
                const budgetPct = budgetLimit > 0 ? (item.amount / budgetLimit) * 100 : 0;
                const budgetColor = budgetPct >= 100 ? 'var(--danger)' : budgetPct >= 80 ? '#f59e0b' : 'var(--success)';

                return (
                  <div key={item.category?.id || Math.random()}
                    onClick={() => { if (item.category?.id) navigate(`/history?category=${item.category.id}&type=${type}${selectedTag ? `&tag=${selectedTag}` : ''}`); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', gap: '8px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {IconComp && <IconComp size={16} color={color} />}
                        <span style={{ fontWeight: 500, fontSize: '14px' }}>{item.category?.name || 'Неизвестно'}</span>
                        {item.momPct !== null && (
                          <span style={{
                            fontSize: '10px', fontWeight: 600, padding: '1px 5px', borderRadius: '6px',
                            background: 'var(--bg-tertiary)',
                            color: type === 'expense'
                              ? (item.momPct <= 0 ? 'var(--success)' : 'var(--danger)')
                              : (item.momPct >= 0 ? 'var(--success)' : 'var(--danger)')
                          }}>
                            {item.momPct >= 0 ? '+' : ''}{item.momPct.toFixed(0)}%
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px', color: type === 'income' ? 'var(--success)' : 'var(--text-primary)' }}>
                          {type === 'income' ? '+' : ''}{formatCurrency(item.amount, 'UZS')}
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 6px', borderRadius: '10px', background: `${color}22`, color, minWidth: '42px', textAlign: 'center' }}>
                          {item.percentage.toFixed(1)}%
                        </span>
                        {item.category?.id && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleHideCategory(item.category!.id);
                            }}
                            title={`Исключить «${item.category.name}» из аналитики`}
                            style={{
                              padding: '4px',
                              color: 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '6px',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              transition: 'color 0.15s ease',
                            }}
                          >
                            <EyeOff size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${item.percentage}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }} />
                    </div>
                    {budgetLimit > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '11px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          Бюджет: {formatCurrency(item.amount, '')} / {formatCurrency(budgetLimit, 'UZS')}
                        </span>
                        <span style={{ fontWeight: 600, color: budgetColor }}>
                          {budgetPct >= 100
                            ? `Перерасход +${formatCurrency(item.amount - budgetLimit, 'UZS')}`
                            : `${Math.round(budgetPct)}% лимита`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Hidden Categories Bottom Panel ── */}
            {hiddenCategoriesData.length > 0 && (
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px dashed var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <EyeOff size={14} style={{ color: 'var(--accent-primary)' }} />
                    Исключены из аналитики ({hiddenCategoriesData.length})
                  </span>
                  <button
                    type="button"
                    onClick={resetHiddenCategories}
                    style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Вернуть все
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {hiddenCategoriesData.map(({ category, amount }) => {
                    const IconComp = getIcon(category?.iconName || '');
                    return (
                      <div
                        key={category!.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--bg-secondary)',
                          border: '1px dashed var(--border-color)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {IconComp && <IconComp size={16} color={category?.color || '#94a3b8'} />}
                          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                            {category?.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                            {formatCurrency(amount, 'UZS')}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleHideCategory(category!.id)}
                            title={`Вернуть «${category?.name}» в аналитику`}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '6px',
                              background: 'var(--bg-tertiary)',
                              color: 'var(--accent-primary)',
                              fontSize: '12px',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              border: '1px solid var(--border-color)',
                              cursor: 'pointer',
                            }}
                          >
                            <Eye size={13} />
                            <span>Показать</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
