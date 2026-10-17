import { useState } from 'react';
import { useStore } from '../store';
import { getIcon, AVAILABLE_ICON_NAMES } from '../lib/icons';
import { ArrowLeft, Plus, Edit2, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TransactionType, Category } from '../types';

const COLORS = [
  '#f59e0b', '#f97316', '#3b82f6', '#8b5cf6', '#eab308', 
  '#0ea5e9', '#6366f1', '#ec4899', '#f43f5e', '#64748b', 
  '#10b981', '#14b8a6', '#ef4444', '#d946ef', '#22c55e', 
  '#84cc16', '#a855f7', '#94a3b8', '#059669', '#475569'
];

export default function Categories() {
  const { categories, addCategory, updateCategory, deleteCategory } = useStore();
  const [activeTab, setActiveTab] = useState<TransactionType>('expense');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [iconName, setIconName] = useState('HelpCircle');
  const [excludeFromStats, setExcludeFromStats] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState('');

  const formatSpacedNumber = (val: string) => {
    if (!val) return '';
    const digits = val.replace(/\D/g, '');
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  };

  const openAdd = () => {
    setEditingId(null);
    setName('');
    setColor(COLORS[0]);
    setIconName('HelpCircle');
    setExcludeFromStats(false);
    setMonthlyBudget('');
    setIsModalOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditingId(c.id);
    setName(c.name);
    setColor(c.color);
    setIconName(c.iconName);
    setExcludeFromStats(c.excludeFromStats || false);
    setMonthlyBudget(c.monthlyBudgetUZS ? String(c.monthlyBudgetUZS) : '');
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const parsedBudget = Number(monthlyBudget.replace(/\s/g, ''));
    const budgetValue = activeTab === 'expense' && !isNaN(parsedBudget) && parsedBudget > 0 ? parsedBudget : 0;
    
    if (editingId) {
      await updateCategory(editingId, {
        name,
        color,
        iconName,
        type: activeTab,
        excludeFromStats,
        monthlyBudgetUZS: budgetValue,
      });
    } else {
      await addCategory({
        name,
        color,
        iconName,
        type: activeTab,
        excludeFromStats,
        ...(budgetValue > 0 ? { monthlyBudgetUZS: budgetValue } : {}),
      });
    }
    setIsModalOpen(false);
  };

  const currentCategories = categories.filter(c => c.type === activeTab);

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <Link to="/" style={{ color: 'var(--text-primary)' }}>
          <ArrowLeft size={24} />
        </Link>
        <h2 style={{ flex: 1, textAlign: 'center' }}>Категории</h2>
        <div style={{ width: 24 }}></div> {/* spacer */}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button 
          onClick={() => setActiveTab('expense')}
          style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-md)', background: activeTab === 'expense' ? 'var(--accent-primary)' : 'var(--bg-secondary)', color: activeTab === 'expense' ? 'white' : 'var(--text-muted)', fontWeight: 600 }}
        >
          Расходы
        </button>
        <button 
          onClick={() => setActiveTab('income')}
          style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-md)', background: activeTab === 'income' ? 'var(--success)' : 'var(--bg-secondary)', color: activeTab === 'income' ? 'white' : 'var(--text-muted)', fontWeight: 600 }}
        >
          Доходы
        </button>
      </div>

      <button
        onClick={openAdd}
        style={{ width: '100%', padding: '16px', background: 'var(--bg-secondary)', border: '2px dashed var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '16px', fontWeight: 500 }}
      >
        <Plus size={20} />
        Добавить категорию
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {currentCategories.map(c => {
          const Icon = getIcon(c.iconName);
          return (
            <div key={c.id} className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: `${c.color}20`, color: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={24} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '16px', fontWeight: 500 }}>{c.name}</div>
                {c.monthlyBudgetUZS && c.monthlyBudgetUZS > 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--accent-primary)', marginTop: '2px', fontWeight: 500 }}>
                    Лимит: {new Intl.NumberFormat('ru-RU').format(c.monthlyBudgetUZS)} UZS / мес
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => openEdit(c)} style={{ padding: '8px', color: 'var(--text-muted)' }}>
                  <Edit2 size={18} />
                </button>
                <button 
                  onClick={() => {
                    if (confirm(`Удалить категорию "${c.name}"?`)) deleteCategory(c.id);
                  }} 
                  style={{ padding: '8px', color: 'var(--danger)' }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {isModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px'
        }}>
          <div className="glass-panel" style={{
            width: '100%', maxWidth: '400px', background: 'var(--bg-primary)',
            borderRadius: '24px', padding: '24px', animation: 'fadeIn 0.2s ease-out',
            maxHeight: '90vh', overflowY: 'auto'
          }}>
            <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px' }}>
              {editingId ? 'Редактировать' : 'Новая категория'}
            </h3>
            
            <input 
              type="text" 
              placeholder="Название категории" 
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ width: '100%', padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', marginBottom: '12px', fontSize: '16px' }}
            />

            {activeTab === 'expense' && (
              <div style={{ marginBottom: '16px' }}>
                <label className="text-muted" style={{ display: 'block', fontSize: '13px', marginBottom: '6px' }}>
                  Месячный лимит в UZS (необязательно)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Например: 2 000 000"
                  value={formatSpacedNumber(monthlyBudget)}
                  onChange={e => setMonthlyBudget(e.target.value.replace(/\D/g, ''))}
                  style={{ width: '100%', padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', fontSize: '15px' }}
                />
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={excludeFromStats}
                onChange={e => setExcludeFromStats(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
              />
              <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Не учитывать в статистике (долги, возвраты)</span>
            </label>

            <label className="text-muted" style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>Цвет</label>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '12px' }}>
              {COLORS.map(c => (
                <button 
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ minWidth: '36px', height: '36px', borderRadius: '50%', background: c, border: c === color ? '3px solid var(--text-primary)' : '3px solid transparent', flexShrink: 0 }}
                />
              ))}
            </div>

            <label className="text-muted" style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>Иконка</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', maxHeight: '200px', overflowY: 'auto', marginBottom: '24px', background: 'var(--bg-secondary)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
              {AVAILABLE_ICON_NAMES.map(iconNm => {
                const IconComp = getIcon(iconNm);
                return (
                  <button 
                    key={iconNm}
                    onClick={() => setIconName(iconNm)}
                    title={iconNm}
                    style={{ 
                      width: '44px', height: '44px', borderRadius: 'var(--radius-sm)', 
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: iconNm === iconName ? 'var(--accent-primary)' : 'transparent',
                      color: iconNm === iconName ? 'white' : 'var(--text-primary)'
                    }}
                  >
                    <IconComp size={24} />
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setIsModalOpen(false)}
                style={{ flex: 1, padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontWeight: 600 }}
              >
                Отмена
              </button>
              <button 
                onClick={handleSave}
                disabled={!name.trim()}
                style={{ flex: 1, padding: '16px', borderRadius: 'var(--radius-md)', background: activeTab === 'expense' ? 'var(--accent-primary)' : 'var(--success)', color: 'white', fontWeight: 600, opacity: !name.trim() ? 0.5 : 1 }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
