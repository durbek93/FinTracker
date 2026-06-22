import { X, Moon, Sun, Globe, Edit2, Shield, ShieldOff, Trash2, Link as LinkIcon, Unlink, Phone, Mail, Loader2, Brain, Eye, EyeOff, Check } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { isAccountProtected } from '../types';
import { auth } from '../firebase';
import { getGeminiKey, setGeminiKey, removeGeminiKey, hasGeminiKey, FINANCIAL_STRATEGIES } from '../lib/gemini';
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

declare global {
  interface Window {
    settingsRecaptchaVerifier: any;
    settingsConfirmationResult: any;
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
  const [aiInstructions, setAiInstructions] = useState(() => localStorage.getItem('gemini_instructions') || '');
  const [selectedStrategy, setSelectedStrategy] = useState(() => localStorage.getItem('gemini_strategy') || 'none');

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
    } catch (e: any) {
      console.error(e);
      setLinkError(e.code === 'auth/credential-already-in-use' ? 'Этот Google аккаунт уже зарегистрирован в другом профиле.' : e.message);
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
    } catch (e: any) {
      console.error(e);
      setLinkError(e.code === 'auth/email-already-in-use' ? 'Этот Email уже существует.' : e.message);
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
      const result = await signInWithPhoneNumber(auth, linkPhone, appVerifier);
      setConfirmationResult(result);
      window.settingsConfirmationResult = result;
    } catch (err: any) {
      console.error(err);
      setLinkError('Ошибка отправки СМС: ' + err.message);
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
    } catch (err: any) {
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
      } catch (e: any) {
        console.error(e);
        setLinkError(e.message);
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
          <label className="text-muted" style={{ display: 'block', fontSize: '14px', marginBottom: '12px' }}>Категории</label>
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
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
