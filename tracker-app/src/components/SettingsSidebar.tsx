import { X, Moon, Sun, Globe, Edit2, Shield, ShieldOff, Trash2, Link as LinkIcon, Unlink, Phone, Mail, Loader2, Brain, Eye, EyeOff, Check, Target, Upload, Lock, Fingerprint } from 'lucide-react';
import { useState, useEffect, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { isAccountProtected } from '../types';
import { auth, db, doc, setDoc, getDocs, query, collection, where } from '../firebase';
import { getGeminiKey, setGeminiKey, removeGeminiKey, hasGeminiKey, FINANCIAL_STRATEGIES } from '../lib/gemini';
import { useFinancialStrategy } from '../hooks/useFinancialStrategy';
import {
  hasPinEnabled,
  setSecurityPin,
  clearSecurityPin,
  isBiometricSupported,
  hasBiometricEnabled,
  registerBiometricUnlock,
  disableBiometricUnlock,
} from '../lib/securityLock';
import { 
  GoogleAuthProvider, 
  EmailAuthProvider, 
  PhoneAuthProvider, 
  linkWithPopup, 
  linkWithCredential, 
  unlink, 
  signInWithPhoneNumber, 
  RecaptchaVerifier, 
  ConfirmationResult 
} from 'firebase/auth';

const ImportModal = lazy(() => import('./ImportModal'));

declare global {
  interface Window {
    settingsRecaptchaVerifier: RecaptchaVerifier | null;
    settingsConfirmationResult: ConfirmationResult | null;
  }
}

interface SettingsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsSidebar({ isOpen, onClose }: SettingsSidebarProps) {
  const navigate = useNavigate();
  const { accounts, updateAccount, deleteAccount } = useStore();
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  // Security PIN & Biometric states
  const [pinActive, setPinActive] = useState(() => hasPinEnabled());
  const [pinInput, setPinInput] = useState('');
  const [showPinForm, setShowPinForm] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);
  const [bioActive, setBioActive] = useState(() => hasBiometricEnabled());

  useEffect(() => {
    isBiometricSupported().then(setBioSupported);
    const syncPin = () => {
      setPinActive(hasPinEnabled());
      setBioActive(hasBiometricEnabled());
    };
    window.addEventListener('fintracker-pin-changed', syncPin);
    return () => window.removeEventListener('fintracker-pin-changed', syncPin);
  }, []);
  
  // Linking states
  const [providers, setProviders] = useState<string[]>([]);
  const [linkingLoading, setLinkingLoading] = useState<string | null>(null);
  const [linkError, setLinkError] = useState('');
  const [activeLinkForm, setActiveLinkForm] = useState<'email' | 'phone' | null>(null);
  const [linkEmail, setLinkEmail] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [linkPhone, setLinkPhone] = useState('+998');
  const [linkCode, setLinkCode] = useState('');
  // AI Key state
  const [apiKeyInput, setApiKeyInput] = useState(() => getGeminiKey() || '');
  const [showKey, setShowKey] = useState(false);
  const [keySaved, setKeySaved] = useState(hasGeminiKey);
  const { strategyId, personalInstructions, saveSettings: persistSettings } = useFinancialStrategy();
  const [aiInstructions, setAiInstructions] = useState(personalInstructions);
  const [selectedStrategy, setSelectedStrategy] = useState(strategyId);

  useEffect(() => {
    setSelectedStrategy(strategyId);
  }, [strategyId]);

  useEffect(() => {
    setAiInstructions(personalInstructions);
  }, [personalInstructions]);

  const handleSaveKey = () => {
    if (apiKeyInput.trim().length > 10) {
      setGeminiKey(apiKeyInput.trim());
      setKeySaved(true);
      setTimeout(() => setKeySaved(false), 2000);
    }
  };

  const handleRemoveKey = () => {
    removeGeminiKey();
    setApiKeyInput('');
    setKeySaved(false);
  };

  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else if (theme === 'light') {
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    } else {
      document.body.classList.remove('dark', 'light');
    }
  }, [theme]);



  // Read current providers on mount and when loading changes
  useEffect(() => {
    if (auth.currentUser) {
      setProviders(auth.currentUser.providerData.map(p => p.providerId));
    }
  }, [isOpen, linkingLoading]);

  // Recaptcha init for phone linking
  useEffect(() => {
    if (activeLinkForm === 'phone' && !window.settingsRecaptchaVerifier) {
      try {
        window.settingsRecaptchaVerifier = new RecaptchaVerifier(auth, 'settings-recaptcha-container', {
          size: 'invisible',
        });
        window.settingsRecaptchaVerifier.render();
      } catch (e) {
        console.error("Recaptcha error:", e);
      }
    }
  }, [activeLinkForm]);

  // Telegram linking states
  const [tgLinked, setTgLinked] = useState<boolean>(false);
  const [tgId, setTgId] = useState<string>('');
  const [tgLinkCode, setTgLinkCode] = useState<string>('');
  const [tgLoading, setTgLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !auth.currentUser) return;

    const checkTelegramLink = async () => {
      try {
        const q = query(collection(db, 'telegramUsers'), where('userId', '==', auth.currentUser!.uid));
        const snap = await getDocs(q);
        if (!snap.empty) {
          setTgLinked(true);
          setTgId(snap.docs[0].id);
        } else {
          setTgLinked(false);
          setTgId('');
        }
      } catch (e) {
        console.error("Failed to check Telegram link:", e);
      }
    };

    checkTelegramLink();
  }, [isOpen, linkingLoading]);

  const handleGenerateTelegramCode = async () => {
    if (!auth.currentUser) return;
    setTgLoading(true);
    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      await setDoc(doc(db, 'linkCodes', code), {
        userId: auth.currentUser.uid,
        createdAt: new Date()
      });
      
      setTgLinkCode(code);
    } catch (e) {
      console.error("Failed to generate Telegram code:", e);
      alert("Ошибка при создании кода привязки.");
    } finally {
      setTgLoading(false);
    }
  };

  if (!isOpen) {
    if (activeLinkForm) setActiveLinkForm(null);
    if (linkError) setLinkError('');
    return null;
  }

  const handleLinkGoogle = async () => {
    setLinkingLoading('google');
    setLinkError('');
    try {
      const provider = new GoogleAuthProvider();
      await linkWithPopup(auth.currentUser!, provider);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      console.error(err);
      setLinkError(err.code === 'auth/credential-already-in-use' ? 'Этот Google аккаунт уже зарегистрирован в другом профиле.' : (err.message || String(e)));
    } finally {
      setLinkingLoading(null);
    }
  };

  const handleLinkEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkingLoading('email');
    setLinkError('');
    try {
      const credential = EmailAuthProvider.credential(linkEmail, linkPassword);
      await linkWithCredential(auth.currentUser!, credential);
      setActiveLinkForm(null);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      console.error(err);
      setLinkError(err.code === 'auth/email-already-in-use' ? 'Этот Email уже существует.' : (err.message || String(e)));
    } finally {
      setLinkingLoading(null);
    }
  };

  const handleSendLinkCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkingLoading('phone');
    setLinkError('');
    try {
      const appVerifier = window.settingsRecaptchaVerifier;
      if (!appVerifier) throw new Error('reCAPTCHA не инициализирован');
      const result = await signInWithPhoneNumber(auth, linkPhone, appVerifier);
      setConfirmationResult(result);
      window.settingsConfirmationResult = result;
    } catch (e) {
      const err = e as { message?: string };
      console.error(err);
      setLinkError('Ошибка отправки СМС: ' + (err.message || String(e)));
      if (window.settingsRecaptchaVerifier) {
        window.settingsRecaptchaVerifier.clear();
        window.settingsRecaptchaVerifier = null;
      }
    } finally {
      setLinkingLoading(null);
    }
  };

  const handleVerifyLinkCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    setLinkingLoading('phone-verify');
    setLinkError('');
    try {
      const credential = PhoneAuthProvider.credential(confirmationResult.verificationId, linkCode);
      await linkWithCredential(auth.currentUser!, credential);
      setActiveLinkForm(null);
      setConfirmationResult(null);
    } catch (e) {
      const err = e as { code?: string };
      console.error(err);
      setLinkError(err.code === 'auth/credential-already-in-use' ? 'Этот номер уже привязан к другому аккаунту.' : 'Неверный СМС код.');
    } finally {
      setLinkingLoading(null);
    }
  };

  const handleUnlink = async (providerId: string) => {
    if (providers.length <= 1) {
      alert("Нельзя отвязать единственный способ входа!");
      return;
    }
    if (confirm(`Вы уверены, что хотите отвязать ${providerId}?`)) {
      setLinkingLoading(`unlink-${providerId}`);
      try {
        await unlink(auth.currentUser!, providerId);
      } catch (e) {
        const err = e as { message?: string };
        console.error(err);
        setLinkError(err.message || String(e));
      } finally {
        setLinkingLoading(null);
      }
    }
  };

  const hasProvider = (id: string) => providers.includes(id);

  return (
    <>
      <div 
        onClick={onClose}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 9998,
          animation: 'fadeIn 0.2s ease forwards'
        }}
      />
      <div 
        className="glass-panel"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: '80%', maxWidth: '360px',
          zIndex: 9999,
          borderLeft: '1px solid var(--border-color)',
          borderRadius: '24px 0 0 24px',
          padding: '24px',
          paddingBottom: '80px', // Extra padding for aesthetics
          display: 'flex', flexDirection: 'column', gap: '24px',
          overflowY: 'auto',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Настройки</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={24} />
          </button>
        </div>

        <div>
          <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '12px' }}>Профиль</label>

          <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>Привязанные аккаунты</h4>
            
            {linkError && (
              <div style={{ background: 'var(--danger)20', color: 'var(--danger)', padding: '8px', borderRadius: '8px', marginBottom: '12px', fontSize: '12px' }}>
                {linkError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* GOOGLE */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>Google</span>
                {hasProvider('google.com') ? (
                  <button onClick={() => handleUnlink('google.com')} disabled={linkingLoading === 'unlink-google.com'} style={{ fontSize: '12px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {linkingLoading === 'unlink-google.com' ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />} Отвязать
                  </button>
                ) : (
                  <button onClick={handleLinkGoogle} disabled={linkingLoading === 'google'} style={{ fontSize: '12px', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {linkingLoading === 'google' ? <Loader2 size={12} className="animate-spin" /> : <LinkIcon size={12} />} Привязать
                  </button>
                )}
              </div>

              {/* EMAIL */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}><Mail size={16} /> Email</span>
                {hasProvider('password') ? (
                  <button onClick={() => handleUnlink('password')} disabled={linkingLoading === 'unlink-password'} style={{ fontSize: '12px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {linkingLoading === 'unlink-password' ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />} Отвязать
                  </button>
                ) : (
                  <button onClick={() => setActiveLinkForm(activeLinkForm === 'email' ? null : 'email')} style={{ fontSize: '12px', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <LinkIcon size={12} /> Привязать
                  </button>
                )}
              </div>
              
              {activeLinkForm === 'email' && !hasProvider('password') && (
                <form onSubmit={handleLinkEmail} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginTop: '4px' }}>
                  <input type="email" value={linkEmail} onChange={e=>setLinkEmail(e.target.value)} placeholder="Email" required style={{ fontSize: '13px', padding: '8px' }} />
                  <input type="password" value={linkPassword} onChange={e=>setLinkPassword(e.target.value)} placeholder="Пароль" required minLength={6} style={{ fontSize: '13px', padding: '8px' }} />
                  <button type="submit" disabled={linkingLoading === 'email'} style={{ background: 'var(--accent-primary)', color: 'white', padding: '8px', borderRadius: '6px', fontSize: '13px', marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
                    {linkingLoading === 'email' ? <Loader2 size={16} className="animate-spin"/> : 'Сохранить Email'}
                  </button>
                </form>
              )}

              {/* PHONE */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}><Phone size={16} /> Телефон</span>
                {hasProvider('phone') ? (
                  <button onClick={() => handleUnlink('phone')} disabled={linkingLoading === 'unlink-phone'} style={{ fontSize: '12px', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {linkingLoading === 'unlink-phone' ? <Loader2 size={12} className="animate-spin" /> : <Unlink size={12} />} Отвязать
                  </button>
                ) : (
                  <button onClick={() => setActiveLinkForm(activeLinkForm === 'phone' ? null : 'phone')} style={{ fontSize: '12px', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <LinkIcon size={12} /> Привязать
                  </button>
                )}
              </div>
              
              {activeLinkForm === 'phone' && !hasProvider('phone') && (
                <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginTop: '4px' }}>
                  <div id="settings-recaptcha-container"></div>
                  {!confirmationResult ? (
                    <form onSubmit={handleSendLinkCode} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input type="tel" value={linkPhone} onChange={e=>setLinkPhone(e.target.value)} placeholder="+998 90 123 45 67" required style={{ fontSize: '13px', padding: '8px' }} />
                      <button type="submit" disabled={linkingLoading === 'phone'} style={{ background: 'var(--accent-primary)', color: 'white', padding: '8px', borderRadius: '6px', fontSize: '13px', marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
                        {linkingLoading === 'phone' ? <Loader2 size={16} className="animate-spin"/> : 'Получить СМС'}
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyLinkCode} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input type="text" value={linkCode} onChange={e=>setLinkCode(e.target.value)} placeholder="Код из СМС" required maxLength={6} style={{ fontSize: '13px', padding: '8px', letterSpacing: '2px', textAlign: 'center' }} />
                      <button type="submit" disabled={linkingLoading === 'phone-verify'} style={{ background: 'var(--success)', color: 'white', padding: '8px', borderRadius: '6px', fontSize: '13px', marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
                        {linkingLoading === 'phone-verify' ? <Loader2 size={16} className="animate-spin"/> : 'Подтвердить код'}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* TELEGRAM */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style={{ color: '#0088cc' }}>
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .24z"/>
                    </svg>
                    Telegram
                  </span>
                  {tgLinked ? (
                    <span style={{ fontSize: '12px', color: 'var(--success)', fontWeight: 600 }}>Привязан ({tgId})</span>
                  ) : (
                    <button 
                      onClick={handleGenerateTelegramCode} 
                      disabled={tgLoading} 
                      style={{ fontSize: '12px', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      {tgLoading ? <Loader2 size={12} className="animate-spin" /> : <LinkIcon size={12} />} Привязать
                    </button>
                  )}
                </div>
                {tgLinkCode && !tgLinked && (
                  <div style={{ padding: '12px', background: 'var(--bg-tertiary)', borderRadius: '8px', marginTop: '4px', fontSize: '13px' }}>
                    <p style={{ marginBottom: '8px', lineHeight: 1.4, color: 'var(--text-muted)' }}>
                      Откройте нашего бота и запустите его (или просто нажмите кнопку ниже):
                    </p>
                    <a 
                      href={`https://t.me/${import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'FinanceTrackerBot'}?start=${tgLinkCode}`} 
                      target="_blank" 
                      rel="noreferrer"
                      style={{ 
                        display: 'block', textDecoration: 'none', textAlign: 'center', 
                        background: 'var(--accent-primary)', color: 'white', padding: '8px', 
                        borderRadius: '6px', fontWeight: 600, marginBottom: '6px' 
                      }}
                    >
                      Открыть бот
                    </a>
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>
                      Код привязки: <strong style={{ fontSize: '14px', color: 'var(--text-primary)', letterSpacing: '1px' }}>{tgLinkCode}</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              onClick={() => {
                auth.signOut();
                onClose();
              }}
              style={{ width: '100%', padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--danger)20', border: '1px solid var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', fontWeight: 600 }}
            >
              Выйти из аккаунта
            </button>
          </div>
        </div>

        <div>
          <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '12px' }}>Оформление</label>
          <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: 'var(--radius-md)' }}>
            <button 
              onClick={() => setTheme('light')}
              style={{ flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', background: theme === 'light' ? 'var(--bg-secondary)' : 'transparent', color: theme === 'light' ? 'var(--accent-primary)' : 'var(--text-muted)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', boxShadow: theme === 'light' ? 'var(--shadow-sm)' : 'none' }}
            >
              <Sun size={18} /> Light
            </button>
            <button 
              onClick={() => setTheme('dark')}
              style={{ flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', background: theme === 'dark' ? 'var(--bg-secondary)' : 'transparent', color: theme === 'dark' ? 'var(--accent-primary)' : 'var(--text-muted)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', boxShadow: theme === 'dark' ? 'var(--shadow-sm)' : 'none' }}
            >
              <Moon size={18} /> Dark
            </button>
            <button 
              onClick={() => setTheme('system')}
              style={{ flex: 1, padding: '8px', borderRadius: 'var(--radius-sm)', background: theme === 'system' ? 'var(--bg-secondary)' : 'transparent', color: theme === 'system' ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: '13px', fontWeight: 600, boxShadow: theme === 'system' ? 'var(--shadow-sm)' : 'none' }}
            >
              Auto
            </button>
          </div>
        </div>

        <div>
          <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '12px' }}>Управление счетами</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '40vh', overflowY: 'auto', paddingRight: '4px' }}>
            {[...accounts].sort((a, b) => (a.order || 0) - (b.order || 0)).map(acc => {
              const isEditing = editingId === acc.id;
              const isProtected = isAccountProtected(acc);
              
              return (
                <div key={acc.id} style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {isEditing ? (
                      <input 
                        autoFocus
                        value={editName} 
                        onChange={e => setEditName(e.target.value)}
                        onBlur={() => {
                          if(editName.trim() && editName !== acc.name) updateAccount(acc.id, { name: editName });
                          setEditingId(null);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            if(editName.trim() && editName !== acc.name) updateAccount(acc.id, { name: editName });
                            setEditingId(null);
                          }
                        }}
                        style={{ flex: 1, padding: '4px 8px', marginRight: '8px', fontSize: '14px', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)' }}
                      />
                    ) : (
                      <span style={{ fontWeight: 500, fontSize: '14px', flex: 1 }}>{acc.name}</span>
                    )}
                    
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        onClick={() => {
                          setEditingId(acc.id);
                          setEditName(acc.name);
                        }}
                        style={{ padding: '6px', color: 'var(--accent-primary)', background: 'transparent' }}
                      >
                        <Edit2 size={16} />
                      </button>
                      
                      <button 
                        onClick={() => updateAccount(acc.id, { isProtected: !isProtected })}
                        style={{ padding: '6px', color: isProtected ? 'var(--success)' : 'var(--text-muted)', background: 'transparent' }}
                        title={isProtected ? "Снять защиту" : "Активировать защиту (запретит удаление)"}
                      >
                        {isProtected ? <Shield size={16} /> : <ShieldOff size={16} />}
                      </button>

                      {!isProtected && (
                        <button 
                          onClick={() => {
                            if (confirm(`Точно удалить счет "${acc.name}"?`)) {
                              deleteAccount(acc.id);
                            }
                          }}
                          style={{ padding: '6px', color: 'var(--danger)', background: 'transparent' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '12px' }}>Разделы и данные</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button 
              style={{ width: '100%', padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-primary)' }}
              onClick={() => {
                onClose();
                navigate('/categories');
              }}
            >
              <Edit2 size={20} />
              <span style={{ flex: 1, textAlign: 'left', fontWeight: 500 }}>Управление категориями</span>
            </button>
            <button 
              style={{ width: '100%', padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-primary)' }}
              onClick={() => {
                onClose();
                navigate('/planning');
              }}
            >
              <Target size={20} style={{ color: 'var(--accent-primary)' }} />
              <span style={{ flex: 1, textAlign: 'left', fontWeight: 500 }}>Цели, Долги и Подписки</span>
            </button>
            <button 
              style={{ width: '100%', padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-primary)' }}
              onClick={() => setImportOpen(true)}
            >
              <Upload size={20} style={{ color: 'var(--success)' }} />
              <span style={{ flex: 1, textAlign: 'left', fontWeight: 500 }}>Импорт из CSV / Excel</span>
            </button>
          </div>
        </div>

        {/* ─── Security PIN & Biometric Section ─── */}
        <div>
          <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '12px' }}>Безопасность</label>
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            border: pinActive ? '1px solid var(--success)' : '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Lock size={20} style={{ color: pinActive ? 'var(--success)' : 'var(--text-muted)' }} />
                <div>
                  <p style={{ fontWeight: 600, fontSize: '14px', margin: 0 }}>PIN-код при входе</p>
                  <p className="text-muted" style={{ fontSize: '11px', margin: 0 }}>
                    {pinActive ? 'Защита активна (4 цифры)' : 'Защитите приложение от посторонних'}
                  </p>
                </div>
              </div>
              {pinActive ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setPinInput('');
                      setShowPinForm(v => !v);
                    }}
                    style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: 600 }}
                  >
                    Сменить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Отключить защиту PIN-кодом?')) {
                        clearSecurityPin();
                        setShowPinForm(false);
                      }
                    }}
                    style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600 }}
                  >
                    Выкл
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setPinInput('');
                    setShowPinForm(v => !v);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--accent-primary)',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  Включить
                </button>
              )}
            </div>

            {showPinForm && (
              <form
                onSubmit={async e => {
                  e.preventDefault();
                  if (!/^\d{4}$/.test(pinInput)) return;
                  await setSecurityPin(pinInput);
                  setPinInput('');
                  setShowPinForm(false);
                }}
                style={{ display: 'flex', gap: '8px' }}
              >
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="\d{4}"
                  placeholder="Введите 4 цифры"
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  autoFocus
                  required
                  style={{ flex: 1, fontSize: '14px', letterSpacing: '4px', textAlign: 'center' }}
                />
                <button
                  type="submit"
                  disabled={pinInput.length !== 4}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--success)',
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 600,
                    opacity: pinInput.length === 4 ? 1 : 0.5,
                  }}
                >
                  Сохранить
                </button>
              </form>
            )}

            {pinActive && bioSupported && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid var(--border-color)',
                paddingTop: '10px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Fingerprint size={18} style={{ color: bioActive ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>FaceID / TouchID</span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (bioActive) {
                      disableBiometricUnlock();
                    } else {
                      const ok = await registerBiometricUnlock(auth.currentUser?.email || 'FinTracker');
                      if (!ok) {
                        alert('Не удалось привязать биометрию на этом устройстве.');
                      }
                    }
                  }}
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: bioActive ? 'var(--danger)' : 'var(--accent-primary)',
                  }}
                >
                  {bioActive ? 'Отключить' : 'Подключить'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ─── AI Key Section ─── */}
        <div>
          <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '12px' }}>AI-помощник</label>
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            padding: '16px',
            border: hasGeminiKey() ? '1px solid var(--accent-primary)' : '1px solid var(--border-color)',
            display: 'flex', flexDirection: 'column', gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Brain size={20} style={{ color: hasGeminiKey() ? 'var(--accent-primary)' : 'var(--text-muted)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 600, fontSize: '14px', marginBottom: '2px' }}>Gemini API Ключ</p>
                <p className="text-muted" style={{ fontSize: '11px', lineHeight: 1.4 }}>
                  {hasGeminiKey() ? '✅ Ключ сохранён — AI-функции активны' : 'Введите ключ из Google AI Studio для активации ИИ'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                  placeholder="AIzaSy..."
                  style={{ width: '100%', boxSizing: 'border-box', paddingRight: '40px', fontSize: '13px', fontFamily: 'monospace' }}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', background: 'transparent', padding: '4px' }}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                onClick={handleSaveKey}
                disabled={!apiKeyInput.trim() || apiKeyInput.trim().length < 10}
                style={{
                  padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                  background: keySaved ? 'var(--success)' : 'var(--accent-primary)',
                  color: 'white', fontSize: '13px', fontWeight: 600,
                  transition: 'background 0.3s',
                  display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0
                }}
              >
                {keySaved ? <Check size={16} /> : 'Сохранить'}
              </button>
            </div>

            {hasGeminiKey() && (
              <div style={{ marginTop: '4px' }}>
                <button
                  onClick={handleRemoveKey}
                  style={{ fontSize: '12px', color: 'var(--danger)', textAlign: 'left', background: 'transparent' }}
                >
                  Удалить ключ
                </button>
              </div>
            )}

            <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'block' }}>
                  Финансовая стратегия
                </label>
                <select
                  value={selectedStrategy}
                  onChange={(e) => {
                    setSelectedStrategy(e.target.value);
                    localStorage.setItem('gemini_strategy', e.target.value);
                    persistSettings(e.target.value, aiInstructions);
                  }}
                  style={{
                    width: '100%',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 10px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    outline: 'none'
                  }}
                >
                  {FINANCIAL_STRATEGIES.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4 }}>
                  {FINANCIAL_STRATEGIES.find(s => s.id === selectedStrategy)?.description}
                </p>
              </div>

              <div>
                <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Edit2 size={14} /> Дополнительные пожелания
                </label>
                <textarea 
                  value={aiInstructions}
                  onChange={(e) => {
                    setAiInstructions(e.target.value);
                    localStorage.setItem('gemini_instructions', e.target.value);
                  }}
                  onBlur={(e) => {
                    persistSettings(selectedStrategy, e.target.value);
                  }}
                  placeholder="Пример: Обращайся на 'вы', делай упор на долгосрочные цели..."
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    color: 'var(--text-primary)',
                    resize: 'vertical',
                    outline: 'none',
                    transition: 'border-color 0.3s'
                  }}
                />
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', fontStyle: 'italic', lineHeight: 1.4 }}>
                  Укажите тон общения ИИ или дополнительные специфические правила анализа трат.
                </p>
              </div>
            </div>

            <p className="text-muted" style={{ fontSize: '11px', lineHeight: 1.5, marginTop: '8px' }}>
              🔒 Ключ хранится <strong>только на вашем устройстве</strong> в памяти браузера. Он никогда не передаётся нам и не попадает в код.
              Получить ключ: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-primary)' }}>aistudio.google.com</a>
            </p>
          </div>
        </div>

        <div>
          <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '12px' }}>Язык / Language</label>
          <button 
            style={{ width: '100%', padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-primary)' }}
            onClick={() => alert("Перевод на другие языки находится в разработке!")}
          >
            <Globe size={20} />
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 500 }}>Русский</span>
          </button>
        </div>
      </div>
      {importOpen && (
        <Suspense fallback={null}>
          <ImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} />
        </Suspense>
      )}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
