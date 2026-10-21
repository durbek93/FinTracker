import { Category } from './types';

export const DEFAULT_CATEGORIES: Category[] = [
  // Расходы
  { id: 'food', name: 'Продукты', iconName: 'ShoppingCart', color: '#f59e0b', type: 'expense' },
  { id: 'cafe', name: 'Кафе/перекус', iconName: 'Coffee', color: '#f97316', type: 'expense' },
  { id: 'transport', name: 'Транспорт', iconName: 'Car', color: '#3b82f6', type: 'expense' },
  { id: 'rent', name: 'Аренда', iconName: 'Home', color: '#8b5cf6', type: 'expense' },
  { id: 'utilities', name: 'Комуналка', iconName: 'Zap', color: '#eab308', type: 'expense' },
  { id: 'internet', name: 'Связь и Инет', iconName: 'Wifi', color: '#0ea5e9', type: 'expense' },
  { id: 'subs', name: 'Подписки/домены', iconName: 'Globe', color: '#6366f1', type: 'expense' },
  { id: 'mom', name: 'Мама', iconName: 'Heart', color: '#ec4899', type: 'expense' },
  { id: 'dad', name: 'Папе', iconName: 'Heart', color: '#ec4899', type: 'expense' },
  { id: 'charity', name: 'Благотвор-ть', iconName: 'Heart', color: '#f43f5e', type: 'expense' },
  { id: 'business', name: 'Де-факто', iconName: 'Briefcase', color: '#64748b', type: 'expense' },
  { id: 'health', name: 'Здоровье', iconName: 'Activity', color: '#10b981', type: 'expense' },
  { id: 'installment', name: 'Рассрочка', iconName: 'CreditCard', color: '#14b8a6', type: 'expense' },
  { id: 'auto', name: 'Авто + бензин', iconName: 'Fuel', color: '#ef4444', type: 'expense' },
  { id: 'clothes', name: 'Одежда', iconName: 'Shirt', color: '#d946ef', type: 'expense' },
  { id: 'investments', name: 'Инвестиции', iconName: 'TrendingUp', color: '#22c55e', type: 'expense' },
  { id: 'savings', name: 'Сбережения', iconName: 'PiggyBank', color: '#84cc16', type: 'expense' },
  { id: 'education', name: 'Разв-ие/обуч', iconName: 'BookOpen', color: '#a855f7', type: 'expense' },
  { id: 'unknown', name: 'неизвет/рас', iconName: 'HelpCircle', color: '#94a3b8', type: 'expense' },
  { id: 'cashout', name: 'Обналичка', iconName: 'Banknote', color: '#059669', type: 'expense' },
  { id: 'work_expenses', name: 'рабочие расх', iconName: 'Briefcase', color: '#475569', type: 'expense' },
  { id: 'lent', name: 'Одолжил', iconName: 'HandCoins', color: '#f59e0b', type: 'expense', excludeFromStats: true },
  { id: 'repaid_by_me', name: 'Вернул долг (я)', iconName: 'CheckCircle', color: '#ef4444', type: 'expense', excludeFromStats: true },

  // Доходы
  { id: 'salary', name: 'Зарплата', iconName: 'Banknote', color: '#10b981', type: 'income' },
  { id: 'other_income', name: 'Прочие доходы', iconName: 'TrendingUp', color: '#3b82f6', type: 'income' },
  { id: 'debt_repaid', name: 'Вернули долг', iconName: 'CheckCircle', color: '#10b981', type: 'income', excludeFromStats: true },
  { id: 'borrowed', name: 'Долг нужно вернуть', iconName: 'HandCoins', color: '#3b82f6', type: 'income', excludeFromStats: true },
];
