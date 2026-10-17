import { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet, Check, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { parseImportFile, convertParsedRowsToTransactions, ParsedImportRow } from '../lib/importUtils';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const formatCurrency = (amount: number, currency: string) =>
  new Intl.NumberFormat('ru-RU').format(Math.round(amount)) + ' ' + currency;

export default function ImportModal({ isOpen, onClose }: ImportModalProps) {
  const { categories, accounts, importTransactionsBatch } = useStore();
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    setError('');
    setSuccessCount(null);

    try {
      const parsed = await parseImportFile(file, categories, accounts);
      if (parsed.length === 0) {
        setError('Не удалось распознать строки с суммами. Проверьте колонки (Дата, Сумма, Категория, Счет, Комментарий).');
      }
      setRows(parsed);
    } catch (err) {
      console.error('Import parse error:', err);
      setError('Ошибка чтения файла. Поддерживаются форматы .csv, .xlsx, .xls');
    } finally {
      setParsing(false);
    }
  };

  const handleRemoveRow = (idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleConfirmImport = async () => {
    if (rows.length === 0) return;
    if (accounts.length === 0) {
      setError('Сначала создайте хотя бы один счёт во вкладке «Счета»!');
      return;
    }

    setImporting(true);
    setError('');
    try {
      const txs = convertParsedRowsToTransactions(rows);
      const count = await importTransactionsBatch(txs);
      setSuccessCount(count);
      setRows([]);
      setTimeout(() => {
        onClose();
        setSuccessCount(null);
        setFileName('');
      }, 1500);
    } catch (err) {
      console.error('Batch import failed:', err);
      setError('Ошибка при сохранении транзакций в базу данных.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 10000,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '16px',
      }}
    >
      <div
        className="glass-panel animate-fade-in"
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '85dvh',
          display: 'flex',
          flexDirection: 'column',
          padding: '20px',
          gap: '16px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileSpreadsheet size={22} style={{ color: 'var(--accent-primary)' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>Импорт из CSV / Excel</h3>
          </div>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={22} />
          </button>
        </div>

        <p className="text-muted" style={{ fontSize: '12px', lineHeight: 1.4, margin: 0 }}>
          Поддерживаются файлы <strong>.xlsx, .xls, .csv</strong> (включая файлы экспорта FinTracker и банковские выписки с колонками: <em>Дата, Сумма, Тип, Категория, Счет, Валюта, Комментарий, Теги</em>).
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={parsing || importing}
          style={{
            padding: '16px',
            borderRadius: 'var(--radius-md)',
            border: '2px dashed var(--accent-primary)',
            background: 'rgba(59, 130, 246, 0.08)',
            color: 'var(--text-primary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
          }}
        >
          {parsing ? (
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
          ) : (
            <Upload size={24} style={{ color: 'var(--accent-primary)' }} />
          )}
          <span style={{ fontSize: '14px', fontWeight: 600 }}>
            {fileName ? `Файл: ${fileName}` : 'Выбрать файл (.csv, .xlsx)'}
          </span>
        </button>

        {error && (
          <div style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(239, 68, 68, 0.15)',
            color: 'var(--danger)',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {successCount !== null && (
          <div style={{
            padding: '12px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(16, 185, 129, 0.15)',
            color: 'var(--success)',
            fontSize: '14px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}>
            <Check size={18} />
            <span>Успешно импортировано операций: {successCount}!</span>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
              <span style={{ fontWeight: 600 }}>Предпросмотр ({rows.length} оп.)</span>
              <button
                type="button"
                onClick={() => setRows([])}
                style={{ fontSize: '12px', color: 'var(--danger)' }}
              >
                Очистить
              </button>
            </div>

            <div style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              maxHeight: '38dvh',
              paddingRight: '4px',
            }}>
              {rows.slice(0, 100).map((r, i) => (
                <div
                  key={`${r.rowNumber}-${i}`}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-tertiary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span>{r.categoryName}</span>
                      <span className="text-muted">• {r.accountName}</span>
                    </div>
                    <div className="text-muted" style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {format(new Date(r.date), 'd MMM yyyy', { locale: ru })}
                      {r.note ? ` • ${r.note}` : ''}
                      {r.tags.length > 0 ? ` • #${r.tags.join(' #')}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{
                      fontWeight: 700,
                      color: r.type === 'income' ? 'var(--success)' : r.type === 'transfer' ? 'var(--accent-primary)' : 'var(--text-primary)',
                    }}>
                      {r.type === 'income' ? '+' : r.type === 'expense' ? '-' : ''}
                      {formatCurrency(r.amount, r.currency)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(i)}
                      style={{ color: 'var(--text-muted)', padding: '4px' }}
                      title="Исключить строку"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {rows.length > 100 && (
                <p className="text-muted" style={{ textAlign: 'center', fontSize: '11px', padding: '4px' }}>
                  И ещё {rows.length - 100} строк...
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent-primary)',
                color: 'white',
                fontWeight: 600,
                fontSize: '15px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {importing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Импортируем...</span>
                </>
              ) : (
                <>
                  <Check size={18} />
                  <span>Импортировать {rows.length} операций</span>
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
