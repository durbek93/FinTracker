import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { getIcon } from '../lib/icons';
import { format, isSameDay, startOfDay, endOfDay, startOfMonth, endOfMonth, isValid } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Wallet, Download, FileSpreadsheet, FileText, Table, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { Transaction } from '../types';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { exportToCSV, exportToXLSX, exportToPDF } from '../lib/exportUtils';

// Formatter function
const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('ru-RU').format(amount) + ' ' + currency;
};

// Helper to group transactions by date
const groupTransactionsByDate = (transactions: Transaction[]) => {
  const groups: { date: Date; transactions: Transaction[] }[] = [];

  // Sort from newest to oldest
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  sorted.forEach(t => {
    const tDate = new Date(t.date);
    const existingGroup = groups.find(g => isSameDay(g.date, tDate));
    if (existingGroup) {
      existingGroup.transactions.push(t);
    } else {
      groups.push({ date: tDate, transactions: [t] });
    }
  });

  return groups;
};

export default function History() {
  const { transactions, categories, accounts, updateTransaction } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  const queryParams = new URLSearchParams(location.search);
  const [localCategory, setLocalCategory] = useState(queryParams.get('category') || '');
  const typeParam = queryParams.get('type');
  const currencyParam = queryParams.get('currency');
  const addToExpensesParam = queryParams.get('addToExpenses');
  const poolParam = queryParams.get('pool');
  const hasFilterParams = Boolean(typeParam || currencyParam || addToExpensesParam || localCategory || poolParam);

  const [selectedType, setSelectedType] = useState<string>(typeParam || 'all');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [searchTerm, setSearchTerm] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Update selectedType if URL parameter changes
  useEffect(() => {
    if (typeParam) setSelectedType(typeParam);
  }, [typeParam]);

  const expenseCategories = categories.filter(c => c.type === 'expense');
  const incomeCategories = categories.filter(c => c.type === 'income');

  const filteredTransactions = transactions.filter(t => {
    const tDate = new Date(t.date);
    
    if (startDate) {
      const sDate = new Date(startDate);
      if (isValid(sDate) && tDate < startOfDay(sDate)) return false;
    }
    if (endDate) {
      const eDate = new Date(endDate);
      if (isValid(eDate) && tDate > endOfDay(eDate)) return false;
    }
    
    // Type filtering (from tabs)
    if (selectedType !== 'all') {
      if (t.type !== selectedType) return false;
    }

    if (localCategory && t.categoryId !== localCategory) return false;

    if (searchTerm) {
      const cat = categories.find(c => c.id === t.categoryId);
      const catName = t.type === 'transfer' ? 'перевод' : (cat?.name.toLowerCase() || '');
      const searchLower = searchTerm.toLowerCase();
      const matchName = catName.includes(searchLower);
      const matchNote = t.note?.toLowerCase().includes(searchLower);
      if (!matchName && !matchNote) return false;
    }
    
    if (poolParam === 'true') {
      const isPoolIncoming = t.type === 'transfer' && t.addToExpenses === true && t.currency === 'UZS';
      const isPoolOutgoing = (t.type === 'expense' && t.currency === 'USD') || (t.type === 'transfer' && t.currency === 'USD');
      if (!isPoolIncoming && !isPoolOutgoing) return false;
    } else {
      if (typeParam && t.type !== typeParam) return false;
      if (currencyParam && t.currency !== currencyParam) return false;
      if (addToExpensesParam === 'true' && t.addToExpenses !== true) return false;
    }
    
    return true;
  });

  const grouped = groupTransactionsByDate(filteredTransactions);

  const dateRangeLabel = {
    from: startDate ? format(new Date(startDate), 'dd.MM.yyyy') : '—',
    to: endDate ? format(new Date(endDate), 'dd.MM.yyyy') : '—',
  };
  const filenameBase = `transactions_${dateRangeLabel.from}_${dateRangeLabel.to}`.replace(/\./g, '-');

  const handleExport = (fmt: 'csv' | 'xlsx' | 'pdf') => {
    setExportOpen(false);
    if (fmt === 'csv') exportToCSV(filteredTransactions, categories, accounts, filenameBase);
    if (fmt === 'xlsx') exportToXLSX(filteredTransactions, categories, accounts, filenameBase);
    if (fmt === 'pdf') exportToPDF(filteredTransactions, categories, accounts, dateRangeLabel, filenameBase);
  };

  const handleTypeChange = (type: string) => {
    setSelectedType(type);
    // If the currently selected category doesn't belong to the new type, reset it
    if (localCategory) {
      const cat = categories.find(c => c.id === localCategory);
      if (cat && type !== 'all' && cat.type !== type) {
        setLocalCategory('');
      }
    }
  };

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {hasFilterParams && (
            <button onClick={() => navigate(-1)} style={{ color: 'var(--text-primary)', marginLeft: '-8px' }}>
              <ArrowLeft size={24} />
            </button>
          )}
          <h2>История операций</h2>
        </div>

        {/* Export button */}
        <div ref={exportRef} style={{ position: 'relative' }}>
          <button
            id="export-btn"
            onClick={() => setExportOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '38px', height: '38px', borderRadius: 'var(--radius-md)',
              background: 'var(--accent-primary)', color: '#fff',
              cursor: 'pointer', border: 'none', outline: 'none',
              boxShadow: '0 2px 8px rgba(79,70,229,0.25)',
              transition: 'opacity 0.2s',
            }}
            aria-label="Экспорт данных"
          >
            <Download size={18} />
          </button>

          {exportOpen && (
            <div className="export-dropdown">
              <button className="export-dropdown-item" onClick={() => handleExport('xlsx')} id="export-xlsx">
                <FileSpreadsheet size={16} />
                XLSX (Excel)
              </button>
              <button className="export-dropdown-item" onClick={() => handleExport('pdf')} id="export-pdf">
                <FileText size={16} />
                PDF
              </button>
              <button className="export-dropdown-item" onClick={() => handleExport('csv')} id="export-csv">
                <Table size={16} />
                CSV (Google Sheets)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Type Selector Tabs: Все | Расход | Приход | Переводы */}
      <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '4px', marginBottom: '14px', gap: '2px' }}>
        <button
          type="button"
          onClick={() => handleTypeChange('all')}
          style={{
            flex: 1, padding: '9px 2px', borderRadius: 'var(--radius-sm)',
            background: selectedType === 'all' ? 'var(--bg-secondary)' : 'transparent',
            color: selectedType === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: selectedType === 'all' ? 600 : 400,
            fontSize: '13px', border: 'none', cursor: 'pointer',
            boxShadow: selectedType === 'all' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          Все
        </button>
        <button
          type="button"
          onClick={() => handleTypeChange('expense')}
          style={{
            flex: 1, padding: '9px 2px', borderRadius: 'var(--radius-sm)',
            background: selectedType === 'expense' ? 'var(--bg-secondary)' : 'transparent',
            color: selectedType === 'expense' ? 'var(--danger)' : 'var(--text-muted)',
            fontWeight: selectedType === 'expense' ? 600 : 400,
            fontSize: '13px', border: 'none', cursor: 'pointer',
            boxShadow: selectedType === 'expense' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          Расходы
        </button>
        <button
          type="button"
          onClick={() => handleTypeChange('income')}
          style={{
            flex: 1, padding: '9px 2px', borderRadius: 'var(--radius-sm)',
            background: selectedType === 'income' ? 'var(--bg-secondary)' : 'transparent',
            color: selectedType === 'income' ? 'var(--success)' : 'var(--text-muted)',
            fontWeight: selectedType === 'income' ? 600 : 400,
            fontSize: '13px', border: 'none', cursor: 'pointer',
            boxShadow: selectedType === 'income' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          Доходы
        </button>
        <button
          type="button"
          onClick={() => handleTypeChange('transfer')}
          style={{
            flex: 1, padding: '9px 2px', borderRadius: 'var(--radius-sm)',
            background: selectedType === 'transfer' ? 'var(--bg-secondary)' : 'transparent',
            color: selectedType === 'transfer' ? 'var(--accent-primary)' : 'var(--text-muted)',
            fontWeight: selectedType === 'transfer' ? 600 : 400,
            fontSize: '13px', border: 'none', cursor: 'pointer',
            boxShadow: selectedType === 'transfer' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          Переводы
        </button>
      </div>

      {/* Filter panel */}
      <div className="glass-panel" style={{ padding: '16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Поиск по заметке..."
              className="date-time-input"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ flex: 1, marginBottom: '4px', width: '100%' }}
            />
            {selectedType !== 'transfer' && (
              <select
                value={localCategory}
                onChange={e => setLocalCategory(e.target.value)}
                className="date-time-input"
                style={{ flex: 1, marginBottom: '4px', width: '100%', boxSizing: 'border-box' }}
              >
                <option value="">Все категории</option>
                {selectedType === 'expense' ? (
                  expenseCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))
                ) : selectedType === 'income' ? (
                  incomeCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))
                ) : (
                  <>
                    <optgroup label="🔴 Расходы">
                      {expenseCategories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="🟢 Доходы">
                      {incomeCategories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </optgroup>
                  </>
                )}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>С даты</label>
              <input
                type="date"
                className="date-time-input"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>По дату</label>
              <input
                type="date"
                className="date-time-input"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        {(startDate || endDate || localCategory || selectedType !== 'all') && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {localCategory ? (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '4px 8px', borderRadius: '4px' }}>
                Категория: {categories.find(c => c.id === localCategory)?.name || 'Неизвестно'}
              </div>
            ) : <div />}
            <button
              onClick={() => { 
                setStartDate(''); 
                setEndDate(''); 
                setSearchTerm(''); 
                setLocalCategory(''); 
                setSelectedType('all');
                navigate('/history'); 
              }}
              style={{ color: 'var(--accent-primary)', fontSize: '14px', fontWeight: 500 }}
            >
              Сбросить фильтр
            </button>
          </div>
        )}
      </div>

      {grouped.length === 0 ? (
        <div className="glass-panel" style={{ padding: '32px', textAlign: 'center' }}>
          <p className="text-muted">Список транзакций пуст</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {grouped.map((group, groupIdx) => {
            const dateLabel = format(group.date, 'd MMMM, yyyy', { locale: ru });
            // Calculate daily totals for UZS
            const dailyTotalExpenseUZS = group.transactions
              .filter(t => t.type === 'expense' && t.currency === 'UZS')
              .reduce((acc, t) => acc + t.amount, 0);

            const dailyTotalIncomeUZS = group.transactions
              .filter(t => t.type === 'income' && t.currency === 'UZS')
              .reduce((acc, t) => acc + t.amount, 0);

            return (
              <div key={groupIdx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', padding: '0 4px' }}>
                  <span className="text-muted" style={{ fontSize: '14px', fontWeight: 500 }}>{dateLabel}</span>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {dailyTotalIncomeUZS > 0 && (
                      <span style={{ fontSize: '13px', color: 'var(--success)', fontWeight: 600 }}>
                        +{formatCurrency(dailyTotalIncomeUZS, 'UZS')}
                      </span>
                    )}
                    {dailyTotalExpenseUZS > 0 && (
                      <span style={{ fontSize: '13px', color: 'var(--danger)', fontWeight: 600 }}>
                        -{formatCurrency(dailyTotalExpenseUZS, 'UZS')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '8px 16px' }}>
                  {group.transactions.map((t, idx) => {
                    const category = categories.find(c => c.id === t.categoryId);
                    const isTransfer = t.type === 'transfer';
                    const isIncome = t.type === 'income';

                    const IconComp = isTransfer ? Wallet : getIcon(category?.iconName || '');
                    const color = isTransfer ? '#8b5cf6' : (category?.color || '#94a3b8');
                    const name = isTransfer ? 'Перевод' : (category?.name || 'Неизвестно');

                    return (
                      <Link key={t.id} to={`/edit/${t.id}`} style={{
                        display: 'flex', alignItems: 'center', padding: '12px 0',
                        borderBottom: idx < group.transactions.length - 1 ? '1px solid var(--border-color)' : 'none',
                        textDecoration: 'none', color: 'inherit'
                      }}>
                        <div style={{
                          width: '40px', height: '40px', borderRadius: 'var(--radius-md)',
                          background: `${color}20`, color: color,
                          display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: '16px'
                        }}>
                          <IconComp size={20} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '2px' }}>{name}</h4>
                          {t.note && (
                            <p className="text-muted" style={{ fontSize: '13px' }}>{t.note}</p>
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
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
