import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Plus, EyeOff, Eye, EyeOff as EyeOffIcon, ArrowUp, ArrowDown } from 'lucide-react';
import { Currency, isAccountProtected } from '../types';
import { Link } from 'react-router-dom';

const formatCurrency = (amount: number, currency: string) => {
  return new Intl.NumberFormat('ru-RU').format(amount) + ' ' + currency;
};

export default function Accounts() {
  const { accounts, addAccount, updateAccount } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCurrency, setNewCurrency] = useState<Currency>('UZS');
  
  const [hideBalance, setHideBalance] = useState(() => localStorage.getItem('hideBalance') === 'true');
  
  useEffect(() => {
    localStorage.setItem('hideBalance', hideBalance.toString());
    // listen to global changes if possible, or just local
  }, [hideBalance]);

  const activeAccounts = accounts.filter(a => !a.excludeFromTotal);
  const totalBalanceUZS = activeAccounts.reduce((acc, a) => acc + (a.currency !== 'USD' ? a.balanceUZS : 0), 0);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await addAccount(newName.trim(), newCurrency);
    setNewName('');
    setIsAdding(false);
  };

  const sortedAccounts = [...accounts].sort((a, b) => (a.order || 0) - (b.order || 0));

  const handleMove = async (currentIndex: number, direction: 'up' | 'down') => {
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === sortedAccounts.length - 1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    const newArr = [...sortedAccounts];
    const temp = newArr[currentIndex];
    newArr[currentIndex] = newArr[newIndex];
    newArr[newIndex] = temp;

    // Reassign all orders sequentially to avoid collisions
    const promises = newArr.map((acc, index) => 
      updateAccount(acc.id, { order: index })
    );

    await Promise.all(promises);
  };

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <h2>Счета</h2>
      </div>

      {/* Main accounts total */}
      <div className="glass-panel" style={{ padding: '24px', background: 'linear-gradient(135deg, var(--accent-primary) 0%, #8b5cf6 100%)', color: 'white', border: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <p style={{ opacity: 0.9, margin: 0, fontSize: '14px' }}>Всего на счетах</p>
          <button onClick={() => setHideBalance(!hideBalance)} style={{ color: 'rgba(255,255,255,0.8)' }}>
            {hideBalance ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        <h3 style={{ fontSize: '32px', fontWeight: 700 }}>
          {hideBalance ? '*** UZS' : formatCurrency(totalBalanceUZS, 'UZS')}
        </h3>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', marginBottom: '8px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Ваши счета</h3>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          style={{ color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', fontWeight: 500 }}
        >
          <Plus size={16} /> Добавить
        </button>
      </div>

      {isAdding && (
        <div className="glass-panel" style={{ padding: '16px', display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="Название счета..." 
            value={newName} 
            onChange={(e) => setNewName(e.target.value)}
            style={{ flex: 1, minWidth: '150px', padding: '10px' }}
          />
          <select 
            value={newCurrency} 
            onChange={e => setNewCurrency(e.target.value as Currency)}
            style={{ padding: '10px', width: '90px' }}
          >
            <option value="UZS">UZS</option>
            <option value="USD">USD</option>
          </select>
          <button 
            onClick={handleCreate}
            style={{ background: 'var(--accent-primary)', color: 'white', padding: '10px 16px', borderRadius: 'var(--radius-md)' }}
          >
            Создать
          </button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '40px' }}>
        {sortedAccounts.map((acc, index) => {
          const currency = acc.currency || 'UZS';
          const balance = currency === 'UZS' ? acc.balanceUZS : acc.balanceUSD;
          const isProtected = isAccountProtected(acc);

          return (
            <div key={acc.id} className="glass-panel" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginRight: '12px' }}>
                <button 
                  onClick={() => handleMove(index, 'up')} 
                  disabled={index === 0}
                  style={{ opacity: index === 0 ? 0.3 : 1, color: 'var(--text-muted)' }}
                >
                  <ArrowUp size={16} />
                </button>
                <button 
                  onClick={() => handleMove(index, 'down')} 
                  disabled={index === sortedAccounts.length - 1}
                  style={{ opacity: index === sortedAccounts.length - 1 ? 0.3 : 1, color: 'var(--text-muted)' }}
                >
                  <ArrowDown size={16} />
                </button>
              </div>

              <Link to={`/account/${acc.id}`} style={{ flex: 1, textDecoration: 'none', color: 'inherit' }}>
                <h4 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                  {acc.name} {isProtected && <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 500 }}>(Защищен)</span>} {acc.excludeFromStats && <span style={{ fontSize: '12px', color: '#f59e0b', fontWeight: 500 }}>(Вне статистики)</span>}
                </h4>
                <p className="text-muted" style={{ fontSize: '13px' }}>
                  {currency} Счет {acc.excludeFromTotal ? '(Скрыт)' : ''}
                </p>
              </Link>
              <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ marginRight: '8px' }}>
                  <span style={{ fontWeight: 600, fontSize: '16px' }}>{(hideBalance || acc.excludeFromTotal) ? '***' : formatCurrency(balance, currency)}</span>
                </div>
                
                <button 
                  onClick={() => updateAccount(acc.id, { excludeFromTotal: !acc.excludeFromTotal })}
                  style={{ color: acc.excludeFromTotal ? 'var(--text-muted)' : 'var(--accent-primary)', padding: '4px' }}
                  title={acc.excludeFromTotal ? "Показывать в общем балансе" : "Скрыть из общего баланса"}
                >
                  {acc.excludeFromTotal ? <EyeOffIcon size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
