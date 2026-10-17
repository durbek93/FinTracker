import { Transaction, Category, Account } from '../types';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

// Type map for display
const TYPE_LABELS: Record<string, string> = {
  income: 'Доход',
  expense: 'Расход',
  transfer: 'Перевод',
};

// Prepare unified rows from transactions
function buildRows(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[]
) {
  return transactions
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map(t => {
      const category = categories.find(c => c.id === t.categoryId);
      const account = accounts.find(a => a.id === t.accountId);
      const toAccount = t.toAccountId ? accounts.find(a => a.id === t.toAccountId) : null;
      const typeLabel = TYPE_LABELS[t.type] || t.type;
      const categoryName = t.type === 'transfer' ? 'Перевод' : (category?.name || '');
      const accountName = account?.name || '';
      const toAccountName = toAccount?.name || '';
      const dateObj = new Date(t.date);
      const dateStr = format(dateObj, 'dd.MM.yyyy', { locale: ru });
      const timeStr = format(dateObj, 'HH:mm', { locale: ru });
      const sign = t.type === 'income' ? '+' : (t.type === 'transfer' ? '' : '-');

      const tagsStr = t.tags && t.tags.length > 0 ? t.tags.map(tag => `#${tag}`).join(' ') : '';

      return {
        Дата: dateStr,
        Время: timeStr,
        Тип: typeLabel,
        Категория: categoryName,
        Счёт: toAccount ? `${accountName} → ${toAccountName}` : accountName,
        Сумма: `${sign}${t.amount.toLocaleString('ru-RU')}`,
        Валюта: t.currency,
        'Курс (если USD)': t.exchangeRate ? String(t.exchangeRate) : '',
        Заметка: t.note || '',
        Теги: tagsStr,
      };
    });
}

// ── CSV ───────────────────────────────────────────────────────────────────────
export function exportToCSV(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
  filename = 'transactions'
) {
  const rows = buildRows(transactions, categories, accounts);
  if (rows.length === 0) return;

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.join(';'),
    ...rows.map(row =>
      headers.map(h => {
        const val = (row as Record<string, string>)[h] ?? '';
        // Wrap in quotes if contains semicolon or newline
        return val.includes(';') || val.includes('\n') ? `"${val}"` : val;
      }).join(';')
    ),
  ];

  const csvContent = '\uFEFF' + csvLines.join('\n'); // BOM for correct Excel encoding
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

// ── XLSX (lazy-loaded on demand) ──────────────────────────────────────────────
export async function exportToXLSX(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
  filename = 'transactions'
) {
  const rows = buildRows(transactions, categories, accounts);
  if (rows.length === 0) return;

  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 12 }, // Дата
    { wch: 8 },  // Время
    { wch: 10 }, // Тип
    { wch: 20 }, // Категория
    { wch: 22 }, // Счёт
    { wch: 16 }, // Сумма
    { wch: 8 },  // Валюта
    { wch: 14 }, // Курс
    { wch: 30 }, // Заметка
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Транзакции');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ── PDF (lazy-loaded on demand) ───────────────────────────────────────────────
export async function exportToPDF(
  transactions: Transaction[],
  categories: Category[],
  accounts: Account[],
  dateRange: { from: string; to: string },
  filename = 'transactions'
) {
  const rows = buildRows(transactions, categories, accounts);
  if (rows.length === 0) return;

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  // Title (latin fallback — jsPDF built-in font doesn't support cyrillic)
  // We output transliterated header and note below
  const title = `Finance Report: ${dateRange.from} – ${dateRange.to}`;
  doc.setFontSize(14);
  doc.text(title, 40, 36);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Transactions: ${rows.length}`, 40, 52);
  doc.setTextColor(0);

  const headers = [['Date', 'Time', 'Type', 'Category', 'Account', 'Amount', 'Currency', 'Rate', 'Note']];
  const body = rows.map(r => [
    r['Дата'], r['Время'], r['Тип'], r['Категория'],
    r['Счёт'], r['Сумма'], r['Валюта'], r['Курс (если USD)'], r['Заметка'],
  ]);

  autoTable(doc, {
    head: headers,
    body,
    startY: 64,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 255] },
    columnStyles: {
      5: { halign: 'right' }, // Сумма
      6: { halign: 'center' }, // Валюта
      7: { halign: 'center' }, // Курс
    },
    margin: { left: 40, right: 40 },
  });

  doc.save(`${filename}.pdf`);
}

// ── Helper ────────────────────────────────────────────────────────────────────
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
