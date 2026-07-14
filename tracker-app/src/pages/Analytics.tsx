import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { getIcon } from '../lib/icons';
import { PieChart, BarChart2, TrendingDown, Calendar, Brain, Sparkles, Loader2, ChevronDown, ChevronUp, Download } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay, isValid } from 'date-fns';
import { getFinancialAdvice, AnalystReport, hasGeminiKey } from '../lib/gemini';
import { useFinancialStrategy } from '../hooks/useFinancialStrategy';

const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('ru-RU').format(Math.round(amount)) + ' ' + currency;
};

// ── SVG Donut Chart ────────────────────────────────────────────────────────
interface DonutSlice { color: string; percentage: number; label: string; }

function DonutChart({ slices }: { slices: DonutSlice[] }) {
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
        ) : (
          <text x={cx} y={cy + 7} textAnchor="middle" fill="var(--text-muted)" fontSize="13">Всего</text>
        )}
      </svg>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function Analytics() {
  const { transactions: storeTransactions, categories } = useStore();
  const navigate = useNavigate();

  const { strategyId, currentStrategy: strategy, personalInstructions } = useFinancialStrategy();

  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [isFilterOpen, setIsFilterOpen] = useState(false);

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

  // Filter out excluded and apply date range
  const transactions = storeTransactions.filter(t => {
    if (t.excludeFromStats) return false;
    const cat = categories.find(c => c.id === t.categoryId);
    if (cat?.excludeFromStats) return false;

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

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [chartMode, setChartMode] = useState<'donut' | 'bar'>('donut');
  const [isExpensesExpanded, setIsExpensesExpanded] = useState(false);

  // ── Expense calculations ─────────────────────────────────────────────────
  const expenseTxs = transactions.filter(t => t.type === 'expense');

  // Regular UZS expenses (not from USD card)
  const regularUZSExpenses = expenseTxs
    .filter(t => t.currency === 'UZS')
    .reduce((acc, t) => acc + t.amount, 0);

  // USD expenses converted to UZS (Вариант А: manual exchange rate)
  const usdExpensesInUZS = expenseTxs
    .filter(t => t.currency === 'USD')
    .reduce((acc, t) => {
      return acc + (t.convertedAmount ?? 0);
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

  // Grand total
  const grandTotal = totalUZSExpenses + usdPoolRemaining;

  // ── Category analytics ────────────────────────────────────────────────────
  const filteredTx = transactions.filter(t => t.type === type);
  const totalAmount = filteredTx.reduce((acc, t) => {
    const amountInUZS = t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0);
    return acc + amountInUZS;
  }, 0);

  const categoryTotals: Record<string, number> = {};
  filteredTx.forEach(t => {
    const amountInUZS = t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0);
    categoryTotals[t.categoryId] = (categoryTotals[t.categoryId] || 0) + amountInUZS;
  });

  const sortedCategories = Object.entries(categoryTotals)
    .map(([id, amount]) => ({
      category: categories.find(c => c.id === id),
      amount,
      percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const donutSlices: DonutSlice[] = sortedCategories.map(item => ({
    color: item.category?.color || 'var(--accent-primary)',
    percentage: item.percentage,
    label: item.category?.name || 'Неизвестно',
  }));

  // Generate AI Report handler
  const handleGenerateReport = async () => {
    setIsAiLoading(true);
    setAiError('');
    setIsAiExpanded(true);
    
    try {
      const expenseTxs = transactions.filter(t => t.type === 'expense');
      const incomeTxs = transactions.filter(t => t.type === 'income');

      // Aggregate incomes
      const totalIncome = incomeTxs.reduce((acc, t) => acc + (t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0)), 0);
      
      const incCatTotals: Record<string, number> = {};
      incomeTxs.forEach(t => {
        const amt = t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0);
        incCatTotals[t.categoryId] = (incCatTotals[t.categoryId] || 0) + amt;
      });
      const incomesByCategory = Object.entries(incCatTotals).map(([id, amt]) => ({
        category: categories.find(c => c.id === id)?.name || 'Неизвестно',
        amount: amt,
        percentage: totalIncome > 0 ? Number(((amt / totalIncome) * 100).toFixed(1)) : 0
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

      const statsData = {
        totalExpenses: grandTotal, // Общие расходы (включая пул)
        categorizedExpensesTotal: totalCategorizedExpenses, // Сумма трат по категориям
        totalIncome: totalIncome,
        expensesByCategory,
        incomesByCategory,
        usdPoolRemaining
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

      {/* Expense / Income toggle */}
      <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '4px', marginBottom: '16px' }}>
        <button onClick={() => setType('expense')}
          style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', background: type === 'expense' ? 'var(--bg-secondary)' : 'transparent', color: type === 'expense' ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: type === 'expense' ? 600 : 400, boxShadow: type === 'expense' ? 'var(--shadow-sm)' : 'none' }}>
          Расходы
        </button>
        <button onClick={() => setType('income')}
          style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', background: type === 'income' ? 'var(--bg-secondary)' : 'transparent', color: type === 'income' ? 'var(--success)' : 'var(--text-muted)', fontWeight: type === 'income' ? 600 : 400, boxShadow: type === 'income' ? 'var(--shadow-sm)' : 'none' }}>
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
      </div>

      {/* ── Expense summary cards (only when "Расходы" tab active) ── */}
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


          {/* Card: income total (no USD pool block) */}
        </div>
      ) : (
        <div className="glass-panel" style={{ padding: '24px', textAlign: 'center', marginBottom: '20px' }}>
          <p className="text-muted" style={{ marginBottom: '4px' }}>Всего доходов (UZS)</p>
          <h3 className="text-gradient" style={{ fontSize: '32px', fontWeight: 700 }}>
            {formatCurrency(totalAmount, 'UZS')}
          </h3>
        </div>
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
                isAiExpanded ? <ChevronUp size={20} color="#a855f7" /> : <ChevronDown size={20} color="#a855f7" />
              )}
            </div>
          )}
        </div>

        {/* AI Report Content */}
        {isAiExpanded && (
          <div style={{
            background: 'var(--glass-bg)',
            border: '1px solid rgba(168,85,247,0.3)',
            borderTop: 'none',
            borderRadius: '0 0 var(--radius-md) var(--radius-md)',
            padding: '20px',
            animation: 'fadeIn 0.3s ease-out'
          }}>
            {aiError && (
              <p style={{ color: 'var(--danger)', fontSize: '13px', textAlign: 'center', margin: 0 }}>{aiError}</p>
            )}
            
            {!aiError && isAiLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '20px 0' }}>
                <Loader2 size={28} className="animate-spin" color="#a855f7" />
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Анализирую ваши финансы...</p>
              </div>
            )}

            {!aiError && !isAiLoading && aiReport && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '12px', background: 'rgba(168,85,247,0.1)', borderRadius: 'var(--radius-sm)' }}>
                  <p style={{ fontSize: '14px', lineHeight: 1.5, margin: 0, fontWeight: 500, color: 'var(--text-primary)' }}>
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
          {type === 'expense' ? 'Траты' : 'Сумма'} по категориям
        </h3>

        {sortedCategories.length === 0 ? (
          <div className="glass-panel" style={{ padding: '32px', textAlign: 'center' }}>
            <p className="text-muted">Нет данных</p>
          </div>
        ) : (
          <div className="glass-panel" style={{ padding: '16px' }}>
            {chartMode === 'donut' && <DonutChart slices={donutSlices} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {sortedCategories.map(item => {
                const IconComp = getIcon(item.category?.iconName || '');
                const color = item.category?.color || 'var(--accent-primary)';
                return (
                  <div key={item.category?.id || Math.random()}
                    onClick={() => { if (item.category?.id) navigate(`/history?category=${item.category.id}`); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {IconComp && <IconComp size={16} color={color} />}
                        <span style={{ fontWeight: 500, fontSize: '14px' }}>{item.category?.name || 'Неизвестно'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '14px' }}>{formatCurrency(item.amount, 'UZS')}</span>
                        <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 6px', borderRadius: '10px', background: `${color}22`, color, minWidth: '42px', textAlign: 'center' }}>
                          {item.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div style={{ width: '100%', height: '6px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${item.percentage}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
