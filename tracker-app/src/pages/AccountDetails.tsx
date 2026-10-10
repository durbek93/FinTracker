import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useStore } from '../store';
import { getIcon } from '../lib/icons';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ArrowLeft, Wallet, Trash2 } from 'lucide-react';
import { isAccountProtected } from '../types';

const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('ru-RU').format(amount) + ' ' + currency;
};

export default function AccountDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { accounts, transactions, categories, deleteAccount } = useStore();
  const [activeTab, setActiveTab] = useState<'all' | 'expense' | 'income'>('all');
  
  const account = accounts.find(a => a.id === id);
  
  if (!account) return <div style={{ padding: '20px' }}>Счет не найден</div>;
  
  const isProtected = isAccountProtected(account);
  
  const accountTransactions = transactions.filter(t => t.accountId === id || t.toAccountId === id);
  
  const currency = account.currency || 'UZS';
  const balance = currency === 'UZS' ? account.balanceUZS : account.balanceUSD;

  // Calculate totals for this account
  const totalIncomeForCard = accountTransactions
    .filter(t => (t.type === 'transfer' ? t.toAccountId === account.id : t.type === 'income'))
    .reduce((acc, t) => {
      const amt = (t.type === 'transfer' && t.toAccountId === account.id && t.convertedAmount) ? t.convertedAmount : t.amount;
      return acc + amt;
    }, 0);

  const totalExpenseForCard = accountTransactions
    .filter(t => (t.type === 'transfer' ? t.accountId === account.id : t.type === 'expense'))
    .reduce((acc, t) => acc + t.amount, 0);

  // Filter transactions based on active tab
  const displayedTransactions = accountTransactions.filter(t => {
    if (activeTab === 'all') return true;
    const isIncome = t.type === 'transfer' ? t.toAccountId === account.id : t.type === 'income';
    if (activeTab === 'income') return isIncome;
    if (activeTab === 'expense') return !isIncome;
    return true;
  });

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header" style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button onClick={() => navigate(-1)} style={{ padding: '8px', marginLeft: '-8px' }}>
          <ArrowLeft size={24} />
        </button>
        <h2 style={{ margin: 0, paddingBottom: '3px', flex: 1 }}>История карты</h2>
        {!isProtected && (
          <button 
            onClick={() => {
              if (confirm(`Вы уверены, что хотите удалить счет "${account.name}"?`)) {
                deleteAccount(account.id);
                navigate('/accounts', { replace: true });
              }
            }}
            style={{ padding: '8px', color: 'var(--danger)', marginRight: '-8px' }}
          >
            <Trash2 size={24} />
          </button>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '24px', background: 'linear-gradient(135deg, var(--accent-primary) 0%, #8b5cf6 100%)', color: 'white', border: 'none', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px' }}>{account.name}</h3>
        <p style={{ opacity: 0.9, marginBottom: '12px', fontSize: '14px' }}>{currency} Счет</p>
        <h2 style={{ fontSize: '32px', fontWeight: 700 }}>
          {formatCurrency(balance, currency)}
        </h2>
      </div>

      {/* Summary strip: Расход / Приход */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
        <div className="glass-panel" style={{ padding: '12px 14px', borderLeft: '3px solid var(--danger)' }}>
          <p className="text-muted" style={{ fontSize: '12px', marginBottom: '2px' }}>Всего расход</p>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            -{formatCurrency(totalExpenseForCard, currency)}
          </p>
        </div>
        <div className="glass-panel" style={{ padding: '12px 14px', borderLeft: '3px solid var(--success)' }}>
          <p className="text-muted" style={{ fontSize: '12px', marginBottom: '2px' }}>Всего приход</p>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--success)', margin: 0 }}>
            +{formatCurrency(totalIncomeForCard, currency)}
          </p>
        </div>
      </div>

      {/* Tabs: Все | Расход | Приход */}
      <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '4px', marginBottom: '16px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          style={{
            flex: 1, padding: '10px 4px', borderRadius: 'var(--radius-sm)',
            background: activeTab === 'all' ? 'var(--bg-secondary)' : 'transparent',
            color: activeTab === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'all' ? 600 : 400,
            fontSize: '14px',
            border: 'none', cursor: 'pointer',
            boxShadow: activeTab === 'all' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          Все ({accountTransactions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('expense')}
          style={{
            flex: 1, padding: '10px 4px', borderRadius: 'var(--radius-sm)',
            background: activeTab === 'expense' ? 'var(--bg-secondary)' : 'transparent',
            color: activeTab === 'expense' ? 'var(--danger)' : 'var(--text-muted)',
            fontWeight: activeTab === 'expense' ? 600 : 400,
            fontSize: '14px',
            border: 'none', cursor: 'pointer',
            boxShadow: activeTab === 'expense' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          Расход
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('income')}
          style={{
            flex: 1, padding: '10px 4px', borderRadius: 'var(--radius-sm)',
            background: activeTab === 'income' ? 'var(--bg-secondary)' : 'transparent',
            color: activeTab === 'income' ? 'var(--success)' : 'var(--text-muted)',
            fontWeight: activeTab === 'income' ? 600 : 400,
            fontSize: '14px',
            border: 'none', cursor: 'pointer',
            boxShadow: activeTab === 'income' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.2s'
          }}
        >
          Приход
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '8px 16px' }}>
        {displayedTransactions.length === 0 ? (
          <p className="text-muted" style={{ padding: '16px 0', textAlign: 'center' }}>
            {activeTab === 'all' ? 'Нет операций' : activeTab === 'expense' ? 'Нет расходов' : 'Нет приходов'}
          </p>
        ) : (
          displayedTransactions.map((t, idx) => {
            const category = categories.find(c => c.id === t.categoryId);
            const isTransfer = t.type === 'transfer';
            const isIncomeForThisCard = isTransfer ? t.toAccountId === account.id : t.type === 'income';
            
            const IconComp = isTransfer ? Wallet : getIcon(category?.iconName || '');
            const color = isTransfer ? '#8b5cf6' : (category?.color || '#94a3b8');
            const name = isTransfer ? (isIncomeForThisCard ? 'Входящий перевод' : 'Исходящий перевод') : (category?.name || 'Неизвестно');
            
            const displayAmount = isTransfer && isIncomeForThisCard && t.convertedAmount ? t.convertedAmount : t.amount;
            const displayCurrency = isTransfer && isIncomeForThisCard ? (account.currency || 'UZS') : t.currency;

            return (
              <Link key={t.id} to={`/edit/${t.id}`} style={{ 
                display: 'flex', alignItems: 'center', padding: '12px 0', 
                borderBottom: idx < displayedTransactions.length - 1 ? '1px solid var(--border-color)' : 'none',
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
                  <p className="text-muted" style={{ fontSize: '12px' }}>
                    {format(new Date(t.date), 'd MMM y', { locale: ru })} {t.note && `• ${t.note}`}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ 
                    fontSize: '16px', fontWeight: 600, 
                    color: isIncomeForThisCard ? 'var(--success)' : 'var(--text-primary)' 
                  }}>
                    {isIncomeForThisCard ? '+' : '-'}{formatCurrency(displayAmount, displayCurrency)}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
