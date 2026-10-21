import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { getIcon } from '../lib/icons';
import { format } from 'date-fns';
import { TransactionType, Currency, Transaction, QuickTemplate } from '../types';
import { ArrowRightLeft, ArrowLeft, Sparkles, Loader2, Calculator, BookmarkPlus, RefreshCw, Hash, X, Camera, Mic, MicOff } from 'lucide-react';
import { parseTransactionText, parseReceiptImage, ParsedTransaction, hasGeminiKey } from '../lib/gemini';
import { fetchCbuUsdRate, getLocalQuickTemplates, loadQuickTemplates, saveQuickTemplates } from '../lib/currencyRate';
import { getDebtCategoryRole } from '../lib/debtUtils';
import CalculatorModal from '../components/CalculatorModal';

export default function AddTransaction() {
  const { addTransaction, updateTransaction, deleteTransaction, accounts, transactions, categories, debts } = useStore();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  const isEditing = Boolean(id);

  const [isSuccess, setIsSuccess] = useState(false);
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('UZS');
  const [exchangeRate, setExchangeRate] = useState('');
  const [cbuRateInfo, setCbuRateInfo] = useState<{ rate: number; date: string } | null>(null);
  const [cbuLoading, setCbuLoading] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [note, setNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [addToExpenses, setAddToExpenses] = useState(false);
  const [excludeFromStats, setExcludeFromStats] = useState(false);
  const [isCalcOpen, setIsCalcOpen] = useState(false);

  // Quick Templates state
  const [templates, setTemplates] = useState<QuickTemplate[]>(() => getLocalQuickTemplates());

  useEffect(() => {
    loadQuickTemplates().then(setTemplates);
  }, []);

  // Collect popular tags from user's transaction history
  const popularTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of transactions) {
      if (t.tags) {
        for (const tg of t.tags) {
          counts.set(tg, (counts.get(tg) || 0) + 1);
        }
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tg]) => tg);
  }, [transactions]);

  // Smart Input state
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiSuccess, setAiSuccess] = useState(false);
  const [aiAutoSave, setAiAutoSave] = useState(() => localStorage.getItem('ai_auto_save') !== 'false');
  const [isListening, setIsListening] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [aiUsageMetadata, setAiUsageMetadata] = useState<{
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  } | null>(null);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Default ids
  useEffect(() => {
    if (!accountId && accounts.length > 0 && !isEditing) {
      setAccountId(accounts[0].id);
      if (accounts.length > 1) {
        setToAccountId(accounts[1].id);
      } else {
        setToAccountId(accounts[0].id);
      }
    }
  }, [accounts, accountId, isEditing]);

  // Load existing data if editing
  useEffect(() => {
    if (isEditing && id && transactions.length > 0) {
      const t = transactions.find(tx => tx.id === id);
      if (t) {
        setType(t.type);
        setAmount(String(t.amount));
        setCurrency(t.currency);
        if (t.exchangeRate) setExchangeRate(String(t.exchangeRate));
        setCategoryId(t.categoryId || '');
        setAccountId(t.accountId);
        if (t.toAccountId) setToAccountId(t.toAccountId);
        setDate(format(new Date(t.date), 'yyyy-MM-dd'));
        setTime(format(new Date(t.date), 'HH:mm'));
        setNote(t.note || '');
        setTags(t.tags || []);
        setAddToExpenses(t.addToExpenses || false);
        setExcludeFromStats(t.excludeFromStats || false);
      }
    }
  }, [isEditing, id, transactions]);

  const sortedAccounts = [...accounts].sort((a, b) => (a.order || 0) - (b.order || 0));

  const filteredCategories = categories.filter(c => c.type === type);

  const formatSpacedNumber = (val: string) => {
    if (!val) return '';
    const parts = val.split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return parts.length > 1 ? `${integerPart}.${parts[1]}` : integerPart;
  };

  const selectedCategory = categories.find(c => c.id === categoryId);
  const isCategoryExcluded = selectedCategory?.excludeFromStats || false;
  const debtRole = selectedCategory ? getDebtCategoryRole(selectedCategory.name, selectedCategory.type) : null;

  const handleAmountChange = (val: string) => {
    const raw = val.replace(/\s/g, '').replace(',', '.');
    if (/^\d*\.?\d{0,2}$/.test(raw)) {
      setAmount(raw);
    }
  };

  const handleExchangeRateChange = (val: string) => {
    const raw = val.replace(/\s/g, '').replace(',', '.');
    if (/^\d*\.?\d{0,4}$/.test(raw)) setExchangeRate(raw);
  };

  const fromAcc = accounts.find(a => a.id === accountId);
  const toAcc = accounts.find(a => a.id === toAccountId);
  
  // Set default currency to fromAcc if transfer
  useEffect(() => {
    if (type === 'transfer' && fromAcc) {
      setCurrency(fromAcc.currency || 'UZS');
    }
  }, [type, fromAcc]);

  const isCrossCurrency = Boolean(type === 'transfer' && fromAcc && toAcc && fromAcc.currency !== toAcc.currency);
  const needsExchangeRate = (type !== 'transfer' && currency !== 'UZS') || isCrossCurrency;

  // Automatically fetch CBU USD rate when needed
  useEffect(() => {
    if (!needsExchangeRate) return;
    let active = true;
    setCbuLoading(true);
    fetchCbuUsdRate().then(info => {
      if (!active) return;
      setCbuLoading(false);
      if (info) {
        setCbuRateInfo(info);
        setExchangeRate(prev => prev || String(info.rate));
      }
    });
    return () => { active = false; };
  }, [needsExchangeRate]);

  const handleRefreshCbuRate = async () => {
    setCbuLoading(true);
    const info = await fetchCbuUsdRate(true);
    setCbuLoading(false);
    if (info) {
      setCbuRateInfo(info);
      setExchangeRate(String(info.rate));
    }
  };

  const normalizeTag = (raw: string) => raw.trim().replace(/^#+/, '').toLowerCase().replace(/\s+/g, '_');

  const handleAddTag = (rawTag: string) => {
    const clean = normalizeTag(rawTag);
    if (!clean) return;
    if (!tags.includes(clean)) {
      setTags([...tags, clean]);
    }
    setTagInput('');
  };

  const handleToggleTag = (tg: string) => {
    if (tags.includes(tg)) {
      setTags(tags.filter(t => t !== tg));
    } else {
      setTags([...tags, tg]);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!amount || (type !== 'transfer' && !categoryId)) {
      alert('Сначала укажите сумму и категорию, чтобы сохранить шаблон.');
      return;
    }
    const cat = categories.find(c => c.id === categoryId);
    const defaultName = note.trim() || cat?.name || 'Шаблон';
    const tplName = prompt('Название быстрого шаблона:', defaultName);
    if (!tplName || !tplName.trim()) return;

    const newTpl: QuickTemplate = {
      id: Date.now().toString(36),
      name: tplName.trim(),
      type,
      amount: Number(amount),
      currency,
      categoryId: type === 'transfer' ? '' : categoryId,
      accountId,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    };
    const updated = [newTpl, ...templates];
    setTemplates(updated);
    await saveQuickTemplates(updated);
  };

  const handleApplyTemplate = (tpl: QuickTemplate) => {
    setType(tpl.type);
    setAmount(String(tpl.amount));
    setCurrency(tpl.currency);
    setCategoryId(tpl.categoryId);
    if (tpl.accountId && accounts.some(a => a.id === tpl.accountId)) {
      setAccountId(tpl.accountId);
    }
    setNote(tpl.note || '');
    setTags(tpl.tags || []);
  };

  const handleDeleteTemplate = async (e: React.MouseEvent, tplId: string) => {
    e.stopPropagation();
    const updated = templates.filter(t => t.id !== tplId);
    setTemplates(updated);
    await saveQuickTemplates(updated);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !accountId || !date) return;
    if (type !== 'transfer' && !categoryId) return;
    if (type === 'transfer' && !toAccountId) return;
    if (type !== 'transfer' && currency !== 'UZS' && !exchangeRate) return;
    
    const transactionDate = new Date(`${date}T${time}`);
    if (transactionDate > new Date()) {
      alert("Нельзя создавать операции в будущем времени!");
      return;
    }
    
    if (type === 'transfer' && accountId === toAccountId) {
       alert("Выберите разные счета для перевода");
       return;
    }

    const finalTags = [...tags];
    if (tagInput.trim()) {
      const pending = normalizeTag(tagInput);
      if (pending && !finalTags.includes(pending)) finalTags.push(pending);
    }

    const payload: Omit<Transaction, 'id'> = {
      amount: Number(amount),
      currency,
      categoryId: type === 'transfer' ? '' : categoryId,
      accountId,
      date: new Date(`${date}T${time}`).toISOString(),
      type,
      ...(finalTags.length > 0 ? { tags: finalTags } : { tags: [] }),
    };

    if (type === 'transfer' && toAccountId) {
      payload.toAccountId = toAccountId;
      
      if (isCrossCurrency && exchangeRate) {
        const rate = Number(exchangeRate);
        payload.exchangeRate = rate;
        
        // If UZS -> USD, we divide. If USD -> UZS, we multiply.
        if (fromAcc?.currency === 'UZS' && toAcc?.currency === 'USD') {
          payload.convertedAmount = payload.amount / rate;
        } else if (fromAcc?.currency === 'USD' && toAcc?.currency === 'UZS') {
          payload.convertedAmount = payload.amount * rate;
        }
      }
    } else if (type !== 'transfer' && currency !== 'UZS' && exchangeRate) {
      const rate = Number(exchangeRate);
      payload.exchangeRate = rate;
      // Convert to UZS
      payload.convertedAmount = payload.amount * rate;
    }
    
    if (note.trim()) {
      payload.note = note.trim();
    }

    if (type !== 'transfer') {
      payload.excludeFromStats = debtRole ? true : excludeFromStats;
      if (debtRole && note.trim()) {
        const matchingDebt = debts.find(d => d.personName.trim().toLowerCase() === note.trim().toLowerCase());
        if (matchingDebt) {
          payload.debtId = matchingDebt.id;
        }
      }
    }

    // Currency purchase expense tracking
    if (type === 'transfer' && fromAcc?.currency === 'UZS' && toAcc?.currency === 'USD') {
      payload.addToExpenses = addToExpenses;
    }

    if (isEditing && id) {
      await updateTransaction(id, payload);
      navigate('/'); // go back to dashboard only if editing
    } else {
      await addTransaction(payload);
      // Reset form instead of navigating
      setAmount('');
      setNote('');
      setTags([]);
      setTagInput('');
      setAddToExpenses(false);
      setExcludeFromStats(false);
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 2000);
    }
  };

  const handleDelete = async () => {
    if (isEditing && id) {
      if (confirm('Удалить эту операцию?')) {
        await deleteTransaction(id);
        navigate('/');
      }
    }
  };

  const applyParsedTransaction = async (parsed: ParsedTransaction) => {
    let matchedCategoryId = categoryId;
    if (parsed.suggestedCategoryName) {
      const exactMatch = categories.find(
        c => c.name.toLowerCase() === parsed.suggestedCategoryName.toLowerCase() && c.type === parsed.type
      );
      const partialMatch = categories.find(
        c =>
          c.type === parsed.type &&
          (c.name.toLowerCase().includes(parsed.suggestedCategoryName.toLowerCase()) ||
            parsed.suggestedCategoryName.toLowerCase().includes(c.name.toLowerCase()))
      );
      const fallbackCat = categories.find(c => c.type === parsed.type);
      matchedCategoryId = (exactMatch || partialMatch || fallbackCat)?.id || categoryId;
    }

    let matchedAccountId = accountId;
    if (parsed.suggestedAccountName) {
      const sugAcc = parsed.suggestedAccountName.toLowerCase();
      const accMatch = accounts.find(
        a => a.name.toLowerCase() === sugAcc || a.name.toLowerCase().includes(sugAcc) || sugAcc.includes(a.name.toLowerCase())
      );
      if (accMatch) matchedAccountId = accMatch.id;
    }

    const finalDate = parsed.date || date;
    const finalTime = parsed.time || time;
    const parsedTags = Array.isArray(parsed.tags)
      ? parsed.tags.map(t => normalizeTag(String(t))).filter(Boolean)
      : [];
    const mergedTags = Array.from(new Set([...tags, ...parsedTags]));

    const parsedAmount = Number(parsed.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new Error('Не удалось распознать сумму операции. Убедитесь, что указана корректная сумма.');
    }

    if (aiAutoSave && matchedCategoryId && matchedAccountId) {
      const payload: Omit<Transaction, 'id'> = {
        amount: parsedAmount,
        currency: parsed.currency,
        categoryId: matchedCategoryId,
        accountId: matchedAccountId,
        date: new Date(`${finalDate}T${finalTime}`).toISOString(),
        type: parsed.type,
        note: parsed.note || '',
        ...(mergedTags.length > 0 ? { tags: mergedTags } : {}),
      };

      await addTransaction(payload);

      setAmount('');
      setNote('');
      setTags([]);
      setType(parsed.type);
      setCurrency(parsed.currency);
      setCategoryId(matchedCategoryId);
      setAccountId(matchedAccountId);
      setDate(finalDate);
      setTime(finalTime);
    } else {
      // Fill form fields for manual review before saving
      setType(parsed.type);
      setAmount(String(parsedAmount));
      setCurrency(parsed.currency);
      if (matchedCategoryId) setCategoryId(matchedCategoryId);
      if (matchedAccountId) setAccountId(matchedAccountId);
      setDate(finalDate);
      setTime(finalTime);
      setNote(parsed.note || '');
      if (mergedTags.length > 0) setTags(mergedTags);
    }

    setAiText('');
    setAiSuccess(true);
    setAiUsageMetadata(parsed.usageMetadata || null);
    setTimeout(() => setAiSuccess(false), 2500);
  };

  const handleAiError = (err: unknown) => {
    const error = err as Error;
    if (error.message === 'NO_API_KEY') {
      setAiError('Не найден API ключ. Добавьте его в Настройках → AI-помощник.');
    } else if (error.message?.includes('429') || error.message?.includes('limit: 0')) {
      setAiError('Бесплатный лимит недоступен (limit: 0). Проверьте настройки ключа в Google AI Studio.');
    } else {
      setAiError('Ошибка AI: ' + (error.message || 'Не удалось распознать операцию.'));
    }
  };

  // Smart Input handler (text)
  const handleSmartInput = async (overrideText?: string) => {
    const textToParse = (overrideText ?? aiText).trim();
    if (!textToParse) return;
    setAiLoading(true);
    setAiError('');
    setAiSuccess(false);
    setAiUsageMetadata(null);
    try {
      const categoryNames = categories.map(c => c.name);
      const accountNames = accounts.map(a => a.name);
      const parsed = await parseTransactionText(textToParse, categoryNames, date, time, accountNames, popularTags);
      await applyParsedTransaction(parsed);
    } catch (err) {
      handleAiError(err);
    } finally {
      setAiLoading(false);
    }
  };

  // Receipt / Screenshot Scanner handler
  const handleReceiptChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setAiLoading(true);
    setAiError('');
    setAiSuccess(false);
    setAiUsageMetadata(null);
    try {
      const categoryNames = categories.map(c => c.name);
      const accountNames = accounts.map(a => a.name);
      const parsed = await parseReceiptImage(file, categoryNames, accountNames, date, time);
      await applyParsedTransaction(parsed);
    } catch (err) {
      handleAiError(err);
    } finally {
      setAiLoading(false);
    }
  };

  // Voice Input handler (Web Speech API)
  const handleToggleVoice = () => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setAiError('Голосовой ввод не поддерживается в этом браузере. Используйте Chrome / Safari.');
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = 'ru-RU';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setAiError('');
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setAiText(transcript);
          handleSmartInput(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error !== 'aborted') {
          setAiError('Не удалось распознать голос. Проверьте доступ к микрофону.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error('Speech recognition error:', e);
      setIsListening(false);
    }
  };

  return (
    <div className="page-content animate-scale-in">
      <div className="page-header" style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        {isEditing && (
          <button type="button" onClick={() => navigate(-1)} style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', background: 'transparent', padding: '4px' }}>
            <ArrowLeft size={24} />
          </button>
        )}
        <h2 style={{ margin: 0 }}>{isEditing ? 'Редактирование' : 'Новая операция'}</h2>
      </div>
      
      {/* Smart Input Block — only show on new transaction */}
      {!isEditing && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(168,85,247,0.08) 100%)',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} style={{ color: '#818cf8' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#818cf8' }}>
                {hasGeminiKey() ? 'AI умный ввод (Текст • Голос • Чек)' : 'AI умный ввод (требуется API ключ)'}
              </span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={aiAutoSave}
                onChange={e => {
                  setAiAutoSave(e.target.checked);
                  localStorage.setItem('ai_auto_save', String(e.target.checked));
                }}
                style={{ width: '14px', height: '14px', accentColor: '#818cf8' }}
              />
              <span>Сразу сохранять</span>
            </label>
          </div>

          <input
            ref={receiptInputRef}
            type="file"
            accept="image/*"
            onChange={handleReceiptChange}
            style={{ display: 'none' }}
          />

          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              type="text"
              value={aiText}
              onChange={e => setAiText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && !aiLoading) {
                  e.preventDefault();
                  handleSmartInput();
                }
              }}
              placeholder={isListening ? 'Говорите...' : 'Напр.: такси 35 тысяч с Хумо #поездки'}
              disabled={aiLoading}
              style={{
                flex: 1, 
                minWidth: 0,
                fontSize: '14px', 
                background: 'rgba(0,0,0,0.2)', 
                border: isListening ? '1px solid var(--danger)' : '1px solid rgba(99,102,241,0.4)', 
                color: 'var(--text-primary)',
                boxShadow: aiLoading ? '0 0 15px rgba(168,85,247,0.4)' : 'none',
                transition: 'all 0.3s ease',
                animation: aiLoading ? 'aiPulse 1.5s infinite' : 'none'
              }}
            />
            <button
              type="button"
              onClick={handleToggleVoice}
              disabled={aiLoading}
              title={isListening ? 'Остановить запись' : 'Голосовой ввод'}
              aria-label="Голосовой ввод"
              style={{
                padding: '10px',
                borderRadius: 'var(--radius-sm)',
                background: isListening ? 'var(--danger)' : 'rgba(99,102,241,0.2)',
                color: isListening ? 'white' : '#818cf8',
                border: '1px solid rgba(99,102,241,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              type="button"
              onClick={() => receiptInputRef.current?.click()}
              disabled={aiLoading}
              title="Сканировать чек или скриншот перевода"
              aria-label="Сканировать чек или скриншот"
              style={{
                padding: '10px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(99,102,241,0.2)',
                color: '#818cf8',
                border: '1px solid rgba(99,102,241,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Camera size={18} />
            </button>
            <button
              type="button"
              onClick={() => handleSmartInput()}
              disabled={!aiText.trim() || aiLoading}
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: aiSuccess
                  ? 'var(--success)'
                  : 'linear-gradient(135deg, #6366f1, #a855f7)',
                color: 'white',
                fontWeight: 600,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.3s',
                flexShrink: 0,
                boxShadow: '0 4px 15px rgba(99,102,241,0.35)'
              }}
            >
              {aiLoading
                ? <Loader2 size={16} className="animate-spin" />
                : aiSuccess
                  ? (aiAutoSave ? 'Сохранено ✓' : 'Заполнено ✓')
                  : <><Sparkles size={15} /><span>AI</span></>}
            </button>
          </div>
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes aiPulse {
              0% { box-shadow: 0 0 0 0 rgba(168,85,247, 0.4); }
              70% { box-shadow: 0 0 0 10px rgba(168,85,247, 0); }
              100% { box-shadow: 0 0 0 0 rgba(168,85,247, 0); }
            }
          `}} />
          {aiError && (
            <p style={{ fontSize: '12px', color: 'var(--danger)', margin: 0 }}>{aiError}</p>
          )}
          {!aiError && !aiSuccess && (
            <p style={{ fontSize: '11px', color: 'rgba(129,140,248,0.7)', margin: 0 }}>
              Напишите текст, надиктуйте голосом 🎙️ или прикрепите фото чека / скриншот 📷
            </p>
          )}
          {aiUsageMetadata && (
            <div style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              display: 'flex',
              gap: '12px',
              marginTop: '4px',
              background: 'rgba(0,0,0,0.1)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)',
              width: 'fit-content'
            }}>
              <span>Prompt: <b>{aiUsageMetadata.promptTokenCount}</b></span>
              <span>Completion: <b>{aiUsageMetadata.candidatesTokenCount}</b></span>
              <span>Total: <b style={{ color: '#a855f7' }}>{aiUsageMetadata.totalTokenCount}</b></span>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {accounts.length === 0 && (
          <div style={{ padding: '16px', background: 'var(--danger-bg)', color: 'var(--danger)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            <p style={{ fontWeight: 600 }}>У вас нет ни одного счета!</p>
            <p style={{ fontSize: '13px' }}>Сначала перейдите во вкладку "Счета" и создайте карту или наличный счет.</p>
          </div>
        )}

        {/* Quick Templates Bar */}
        {!isEditing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="text-muted" style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                ⚡ Быстрые шаблоны
              </span>
              <button
                type="button"
                onClick={handleSaveAsTemplate}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  fontSize: '12px', color: 'var(--accent-primary)', fontWeight: 600,
                  background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: 'var(--radius-sm)', padding: '4px 8px', cursor: 'pointer'
                }}
              >
                <BookmarkPlus size={13} />
                <span>Сохранить текущий</span>
              </button>
            </div>

            {templates.length > 0 ? (
              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                {templates.map(tpl => {
                  const cat = categories.find(c => c.id === tpl.categoryId);
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => handleApplyTemplate(tpl)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '6px 10px', borderRadius: '999px',
                        background: 'var(--bg-tertiary)',
                        border: `1px solid ${cat?.color ? `${cat.color}40` : 'var(--border-color)'}`,
                        cursor: 'pointer', flexShrink: 0, fontSize: '12px', userSelect: 'none'
                      }}
                    >
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{tpl.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {new Intl.NumberFormat('ru-RU').format(tpl.amount)} {tpl.currency}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteTemplate(e, tpl.id)}
                        style={{ color: 'var(--text-muted)', padding: '2px', display: 'flex', alignItems: 'center' }}
                        title="Удалить шаблон"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted" style={{ fontSize: '11px', margin: 0 }}>
                Заполните сумму и категорию и нажмите «Сохранить текущий», чтобы добавлять частые операции в 1 касание.
              </p>
            )}
          </div>
        )}

        {/* Type Selector */}
        <div style={{ display: 'flex', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: '4px' }}>
          <button 
            type="button"
            onClick={() => { setType('expense'); setCategoryId(''); }}
            style={{ 
              flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', 
              background: type === 'expense' ? 'var(--bg-secondary)' : 'transparent',
              color: type === 'expense' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: type === 'expense' ? 600 : 400,
              boxShadow: type === 'expense' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            Расход
          </button>
          <button 
            type="button"
            onClick={() => { setType('income'); setCategoryId(''); }}
            style={{ 
              flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', 
              background: type === 'income' ? 'var(--bg-secondary)' : 'transparent',
              color: type === 'income' ? 'var(--success)' : 'var(--text-muted)',
              fontWeight: type === 'income' ? 600 : 400,
              boxShadow: type === 'income' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            Доход
          </button>
          <button 
            type="button"
            onClick={() => { setType('transfer'); setCategoryId(''); }}
            style={{ 
              flex: 1, padding: '10px', borderRadius: 'var(--radius-sm)', 
              background: type === 'transfer' ? 'var(--bg-secondary)' : 'transparent',
              color: type === 'transfer' ? 'var(--accent-primary)' : 'var(--text-muted)',
              fontWeight: type === 'transfer' ? 600 : 400,
              boxShadow: type === 'transfer' ? 'var(--shadow-sm)' : 'none'
            }}
          >
            Перевод
          </button>
        </div>

        {/* Amount & Currency */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label className="text-muted" style={{ fontSize: '14px', margin: 0 }}>Сумма</label>
            <button
              type="button"
              onClick={() => setIsCalcOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                color: 'var(--accent-primary)',
                background: 'rgba(99, 102, 241, 0.1)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.2s ease'
              }}
              title="Открыть калькулятор"
            >
              <Calculator size={14} />
              <span>Калькулятор</span>
            </button>
          </div>
          <div style={{ 
            display: 'flex', 
            background: 'var(--bg-secondary)', 
            border: '1px solid var(--border-color)', 
            borderRadius: 'var(--radius-md)',
            transition: 'border-color 0.25s ease'
          }}>
            <input 
              type="text" 
              inputMode="decimal"
              value={formatSpacedNumber(amount)} 
              onChange={e => handleAmountChange(e.target.value)} 
              placeholder="0" 
              required
              style={{ flex: 1, minWidth: 0, fontSize: '24px', fontWeight: 600, padding: '16px', border: 'none', background: 'transparent', outline: 'none' }}
              onFocus={(e) => { e.target.parentElement!.style.borderColor = 'var(--accent-primary)'; e.target.parentElement!.style.boxShadow = '0 0 0 4px rgba(59, 130, 246, 0.1)'; }}
              onBlur={(e) => { e.target.parentElement!.style.borderColor = 'var(--border-color)'; e.target.parentElement!.style.boxShadow = 'none'; }}
            />
            <select 
              value={currency} 
              onChange={e => setCurrency(e.target.value as Currency)}
              style={{ padding: '0 16px', fontSize: '18px', fontWeight: 600, border: 'none', background: 'transparent', borderLeft: '1px solid var(--border-color)', outline: 'none', borderRadius: 0, borderTopRightRadius: 'var(--radius-md)', borderBottomRightRadius: 'var(--radius-md)' }}
            >
              <option value="UZS">UZS</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        {/* Exchange Rate for USD Income/Expense */}
        {type !== 'transfer' && currency !== 'UZS' && (
          <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
              <label className="text-muted" style={{ fontSize: '14px', margin: 0 }}>
                Курс конвертации (1 USD = X UZS)
              </label>
              <button
                type="button"
                onClick={handleRefreshCbuRate}
                disabled={cbuLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 600,
                  background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: '8px', padding: '3px 8px', cursor: 'pointer'
                }}
              >
                <RefreshCw size={11} className={cbuLoading ? 'animate-spin' : ''} />
                <span>
                  {cbuRateInfo ? `Курс ЦБ: ${formatSpacedNumber(String(cbuRateInfo.rate))}` : 'Курс ЦБ РУз'}
                </span>
              </button>
            </div>
            <input 
              type="text" 
              inputMode="numeric"
              value={formatSpacedNumber(exchangeRate)} 
              onChange={e => handleExchangeRateChange(e.target.value)} 
              placeholder="Например: 12850" 
              required
              style={{ width: '100%', fontSize: '18px', fontWeight: 600, padding: '8px', border: 'none', background: 'transparent', outline: 'none', borderBottom: '2px solid var(--border-color)' }}
            />
            {amount && exchangeRate && (
              <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--accent-primary)', fontWeight: 500 }}>
                Эквивалент: {formatSpacedNumber(String(Math.round(Number(amount) * Number(exchangeRate))))} UZS
              </p>
            )}
          </div>
        )}

        {/* Category Grid - Hidden for Transfer */}
        {type !== 'transfer' && (
          <div>
            <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Категория</label>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', 
              gap: '12px',
              maxHeight: '200px',
              overflowY: 'auto',
              padding: '4px'
            }}>
              {filteredCategories.map(c => {
                const IconComp = getIcon(c.iconName);
                const isSelected = categoryId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCategoryId(c.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                      padding: '12px 8px', borderRadius: 'var(--radius-md)',
                      background: isSelected ? `${c.color}20` : 'var(--bg-tertiary)',
                      border: `1px solid ${isSelected ? c.color : 'transparent'}`,
                      transition: 'all 0.2s',
                      minHeight: '80px'
                    }}
                  >
                    <div style={{ color: isSelected ? c.color : 'var(--text-muted)' }}>
                      <IconComp size={24} />
                    </div>
                    <span style={{ 
                       fontSize: '11px', textAlign: 'center', lineHeight: 1.2,
                       color: isSelected ? 'var(--text-primary)' : 'var(--text-muted)'
                    }}>
                      {c.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Account & Date */}
        {type === 'transfer' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Откуда</label>
                <select value={accountId} onChange={e => setAccountId(e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', maxWidth: '100%' }} required>
                  {sortedAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <button
                type="button"
                onClick={() => {
                  const temp = accountId;
                  setAccountId(toAccountId);
                  setToAccountId(temp);
                }}
                style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', marginBottom: '2px' }}
              >
                <ArrowRightLeft size={18} />
              </button>
              <div style={{ flex: 1 }}>
                <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Куда</label>
                <select value={toAccountId} onChange={e => setToAccountId(e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', maxWidth: '100%' }} required>
                  {sortedAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>
            
            {isCrossCurrency && (
              <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
                  <label className="text-muted" style={{ fontSize: '14px', margin: 0 }}>
                    Курс конвертации (1 USD = X UZS)
                  </label>
                  <button
                    type="button"
                    onClick={handleRefreshCbuRate}
                    disabled={cbuLoading}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 600,
                      background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.25)',
                      borderRadius: '8px', padding: '3px 8px', cursor: 'pointer'
                    }}
                  >
                    <RefreshCw size={11} className={cbuLoading ? 'animate-spin' : ''} />
                    <span>
                      {cbuRateInfo ? `Курс ЦБ: ${formatSpacedNumber(String(cbuRateInfo.rate))}` : 'Курс ЦБ РУз'}
                    </span>
                  </button>
                </div>
                <input 
                  type="text" 
                  inputMode="numeric"
                  value={formatSpacedNumber(exchangeRate)} 
                  onChange={e => handleExchangeRateChange(e.target.value)} 
                  placeholder="Например: 12850" 
                  required={isCrossCurrency}
                  style={{ width: '100%', fontSize: '18px', fontWeight: 600 }}
                />
                {amount && exchangeRate && (
                  <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--accent-primary)', fontWeight: 500 }}>
                    Итого к зачислению: {
                      (() => {
                        const amt = Number(amount);
                        const rate = Number(exchangeRate);
                        if (fromAcc?.currency === 'UZS' && toAcc?.currency === 'USD') {
                          return (amt / rate).toFixed(2) + ' USD';
                        } else {
                          return formatSpacedNumber(String(Math.round(amt * rate))) + ' UZS';
                        }
                      })()
                    }
                  </p>
                )}
              </div>
            )}

            {/* Checkbox: учитывать обмен как расход */}
            {fromAcc?.currency === 'UZS' && toAcc?.currency === 'USD' && (
              <label
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                  padding: '14px 16px',
                  background: addToExpenses ? 'rgba(79,70,229,0.08)' : 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${addToExpenses ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={addToExpenses}
                  onChange={e => setAddToExpenses(e.target.checked)}
                  style={{ marginTop: '2px', width: '18px', height: '18px', accentColor: 'var(--accent-primary)', cursor: 'pointer', flexShrink: 0 }}
                />
                <div>
                  <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>Учитывать обмен как расход</p>
                  <p className="text-muted" style={{ fontSize: '12px', lineHeight: 1.4 }}>
                    Сумма в UZS отобразится в разделе «Конвертировано в USD» в Статистике
                  </p>
                </div>
              </label>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Дата</label>
                <input type="date" value={date} max={todayStr} onChange={e => setDate(e.target.value)} className="date-time-input" required />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Время</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} className="date-time-input" required />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Счет</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', maxWidth: '100%' }} required>
                {sortedAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Дата</label>
                <input type="date" value={date} max={todayStr} onChange={e => setDate(e.target.value)} className="date-time-input" required />
              </div>
              <div>
                <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>Время</label>
                <input type="time" value={time} onChange={e => setTime(e.target.value)} className="date-time-input" required />
              </div>
            </div>
          </div>
        )}

        {/* Note */}
        <div>
          <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '8px' }}>
            {debtRole ? 'Кому / У кого (Имя должника или заёмщика)' : 'Заметка (необязательно)'}
          </label>
          <input 
            type="text" 
            value={note} 
            onChange={e => setNote(e.target.value)} 
            placeholder={debtRole ? 'Например: Алишер' : 'Описание...'} 
            style={{ display: 'block', width: '100%', boxSizing: 'border-box', maxWidth: '100%' }}
          />
          {debtRole && debts.some(d => !d.isSettled) && (
            <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Выбрать открытый долг:</span>
              {debts
                .filter(d => !d.isSettled)
                .map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setNote(d.personName)}
                    style={{
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      background: note.trim().toLowerCase() === d.personName.trim().toLowerCase() ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: note.trim().toLowerCase() === d.personName.trim().toLowerCase() ? 'white' : 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      cursor: 'pointer',
                    }}
                  >
                    {d.personName} ({d.type === 'lent' ? 'мне должен' : 'я должен'})
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Tags (#теги) */}
        <div>
          <label className="text-muted" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '14px', marginBottom: '8px' }}>
            <Hash size={14} />
            <span>Теги (необязательно)</span>
          </label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: (tags.length > 0 || popularTags.length > 0) ? '8px' : '0' }}>
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  handleAddTag(tagInput);
                }
              }}
              placeholder="Например: отпуск, работа, авто..."
              style={{ flex: 1, fontSize: '14px' }}
            />
            {tagInput.trim() && (
              <button
                type="button"
                onClick={() => handleAddTag(tagInput)}
                style={{
                  padding: '0 14px', borderRadius: 'var(--radius-md)',
                  background: 'var(--accent-primary)', color: '#fff', fontWeight: 600, fontSize: '13px'
                }}
              >
                + Тег
              </button>
            )}
          </div>

          {tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: popularTags.length > 0 ? '8px' : '0' }}>
              {tags.map(tg => (
                <span
                  key={tg}
                  onClick={() => handleToggleTag(tg)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px',
                    background: 'var(--accent-primary)', color: '#fff', cursor: 'pointer'
                  }}
                >
                  #{tg}
                  <X size={12} />
                </span>
              ))}
            </div>
          )}

          {popularTags.filter(tg => !tags.includes(tg)).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
              <span className="text-muted" style={{ fontSize: '11px' }}>Частые:</span>
              {popularTags.filter(tg => !tags.includes(tg)).map(tg => (
                <button
                  key={tg}
                  type="button"
                  onClick={() => handleToggleTag(tg)}
                  style={{
                    fontSize: '11px', padding: '3px 8px', borderRadius: '999px',
                    background: 'var(--bg-tertiary)', color: 'var(--text-muted)',
                    border: '1px solid var(--border-color)', cursor: 'pointer'
                  }}
                >
                  +{tg}
                </button>
              ))}
            </div>
          )}
        </div>

        {type !== 'transfer' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: isCategoryExcluded ? 'not-allowed' : 'pointer', background: 'var(--bg-secondary)', padding: '14px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', opacity: isCategoryExcluded ? 0.7 : 1 }}>
            <input 
              type="checkbox" 
              checked={isCategoryExcluded ? true : excludeFromStats} 
              onChange={e => { if (!isCategoryExcluded) setExcludeFromStats(e.target.checked); }} 
              disabled={isCategoryExcluded}
              style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)', cursor: isCategoryExcluded ? 'not-allowed' : 'pointer', flexShrink: 0 }}
            />
            <div>
              <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>Скрыть из статистики</p>
              <p className="text-muted" style={{ fontSize: '12px', lineHeight: 1.4 }}>
                {isCategoryExcluded ? "Скрыто из статистики настройками выбранной категории." : "Эта операция изменит баланс счета, но не будет участвовать в отчетах по категориям."}
              </p>
            </div>
          </label>
        )}

        <button 
          type="submit" 
          disabled={!amount || (type !== 'transfer' && !categoryId) || (type !== 'transfer' && currency !== 'UZS' && !exchangeRate) || isSuccess}
          style={{
            background: isSuccess ? 'var(--success)' : 'var(--accent-primary)',
            color: 'white',
            padding: '16px',
            borderRadius: 'var(--radius-md)',
            fontSize: '18px',
            fontWeight: 600,
            marginTop: '10px',
            boxShadow: isSuccess ? 'none' : 'var(--shadow-glow)',
            transition: 'all 0.3s ease'
          }}
        >
          {isSuccess ? 'Добавлено! ✓' : (isEditing ? 'Обновить' : 'Сохранить')}
        </button>

        {isEditing && (
          <button 
            type="button" 
            onClick={handleDelete}
            style={{
              background: 'transparent',
              color: 'var(--danger)',
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '16px',
              fontWeight: 600,
              marginTop: '-10px',
              border: '1px solid var(--danger-bg)'
            }}
          >
            Удалить операцию
          </button>
        )}
      </form>

      <CalculatorModal
        isOpen={isCalcOpen}
        onClose={() => setIsCalcOpen(false)}
        onApply={val => setAmount(val)}
        initialValue={amount}
      />
    </div>
  );
}
