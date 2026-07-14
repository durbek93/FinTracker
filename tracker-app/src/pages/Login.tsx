import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  RecaptchaVerifier, 
  signInWithPhoneNumber,
  ConfirmationResult
} from 'firebase/auth';
import { Mail, Phone, Lock, Hash, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';

declare global {
  interface Window {
    recaptchaVerifier: RecaptchaVerifier | null;
    confirmationResult: ConfirmationResult | null;
  }
}

export default function Login() {
  const [activeTab, setActiveTab] = useState<'email' | 'phone'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Email Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  // Phone Auth State
  const [phone, setPhone] = useState('+998'); // Default UZB code
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is already logged in
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        navigate('/');
      }
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (activeTab === 'phone' && !window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
        });
        window.recaptchaVerifier.render();
      } catch (e) {
        console.error("Recaptcha error:", e);
      }
    }
  }, [activeTab]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      navigate('/');
    } catch (err) {
      const error = err as { code?: string; message?: string };
      console.error(error);
      if (error.code === 'auth/user-not-found') {
        setError('Пользователь с таким email не найден. Попробуйте зарегистрироваться.');
      } else if (error.code === 'auth/wrong-password') {
        setError('Неверный пароль.');
      } else if (error.code === 'auth/email-already-in-use') {
        setError('Этот email уже зарегистрирован. Попробуйте войти.');
      } else {
        setError('Ошибка авторизации: ' + (error.message || String(err)));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const appVerifier = window.recaptchaVerifier;
      if (!appVerifier) throw new Error('reCAPTCHA не инициализирован');
      const result = await signInWithPhoneNumber(auth, phone, appVerifier);
      setConfirmationResult(result);
      window.confirmationResult = result;
    } catch (err) {
      const error = err as { message?: string };
      console.error(error);
      setError('Ошибка отправки СМС: ' + (error.message || String(err)));
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    setIsLoading(true);
    setError('');
    try {
      await confirmationResult.confirm(verificationCode);
      navigate('/');
    } catch (err) {
      console.error(err);
      setError('Неверный код авторизации.');
    } finally {
      setIsLoading(false);
    }
  };

  const tg = (window as any).Telegram?.WebApp;
  const isTelegram = tg && tg.initData;

  if (isTelegram) {
    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', padding: '20px' }}>
        <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', padding: '40px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
            <Loader2 size={48} className="animate-spin" style={{ color: 'var(--accent-primary)' }} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>Вход через Telegram</h2>
          <p className="text-muted" style={{ fontSize: '15px' }}>Выполняется бесшовная авторизация в системе...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', overflow: 'hidden' }}>
        <div style={{ textAlign: 'center', padding: '32px 24px 24px' }}>
          <div style={{ 
            width: '64px', height: '64px', borderRadius: '16px', 
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', color: 'white'
          }}>
            <ShieldCheck size={32} />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', color: 'var(--text-primary)' }}>Добро пожаловать</h2>
          <p className="text-muted" style={{ fontSize: '15px' }}>Войдите, чтобы продолжить использование приложения</p>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '24px' }}>
          <button 
            type="button"
            onClick={() => { setActiveTab('email'); setError(''); }}
            style={{ 
              flex: 1, padding: '16px 0', fontWeight: 600, 
              color: activeTab === 'email' ? 'var(--accent-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'email' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              transition: 'all 0.2s', background: 'transparent'
            }}
          >
            Email
          </button>
          <button 
            type="button"
            onClick={() => { setActiveTab('phone'); setError(''); }}
            style={{ 
              flex: 1, padding: '16px 0', fontWeight: 600, 
              color: activeTab === 'phone' ? 'var(--accent-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'phone' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              transition: 'all 0.2s', background: 'transparent'
            }}
          >
            Телефон
          </button>
        </div>

        <div style={{ padding: '0 24px 32px', minHeight: '340px' }}>
          {error && (
            <div style={{ background: 'var(--danger)20', color: 'var(--danger)', padding: '12px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {activeTab === 'email' && (
            <form onSubmit={handleEmailAuth}>
              <div className="form-group" style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Почта (Email)</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={20} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-muted)' }} />
                  <input 
                    type="email" 
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="example@mail.com"
                    style={{ width: '100%', paddingLeft: '40px' }}
                    required 
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Пароль</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={20} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-muted)' }} />
                  <input 
                    type="password" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="******"
                    style={{ width: '100%', paddingLeft: '40px' }}
                    minLength={6}
                    required 
                  />
                </div>
              </div>
              
              <button 
                type="submit" 
                disabled={isLoading} 
                style={{ 
                  width: '100%', padding: '16px', background: 'linear-gradient(135deg, var(--accent-primary) 0%, #2563eb 100%)', 
                  color: 'white', fontWeight: 600, fontSize: '16px', borderRadius: 'var(--radius-md)', 
                  display: 'flex', justifyContent: 'center', alignItems: 'center', border: 'none',
                  boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
                }}
              >
                {isLoading ? <Loader2 size={20} className="animate-spin" /> : (isSignUp ? 'Зарегистрироваться' : 'Войти')}
              </button>

              <div style={{ textAlign: 'center', marginTop: '16px' }}>
                <button type="button" onClick={() => setIsSignUp(!isSignUp)} style={{ background: 'transparent', color: 'var(--accent-primary)', fontSize: '14px', border: 'none' }}>
                  {isSignUp ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'phone' && (
            <div>
              <div id="recaptcha-container"></div>
              {!confirmationResult ? (
                <form onSubmit={handleSendCode}>
                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Номер телефона</label>
                    <div style={{ position: 'relative' }}>
                      <Phone size={20} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-muted)' }} />
                      <input 
                        type="tel" 
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="+998 90 123 45 67"
                        style={{ width: '100%', paddingLeft: '40px', letterSpacing: '1px' }}
                        required 
                      />
                    </div>
                    <small className="text-muted" style={{ display: 'block', marginTop: '8px' }}>Вводите в международном формате (+998).</small>
                  </div>
                  <button 
                    type="submit" 
                    disabled={isLoading} 
                    style={{ 
                      width: '100%', padding: '16px', background: 'linear-gradient(135deg, var(--accent-primary) 0%, #2563eb 100%)', 
                      color: 'white', fontWeight: 600, fontSize: '16px', borderRadius: 'var(--radius-md)', 
                      display: 'flex', justifyContent: 'center', alignItems: 'center', border: 'none',
                      boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
                    }}
                  >
                    {isLoading ? <Loader2 size={20} className="animate-spin" /> : (
                      <>Получить СМС код <ArrowRight size={18} style={{ marginLeft: '8px' }} /></>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyCode}>
                  <div className="form-group" style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>Код из СМС</label>
                    <div style={{ position: 'relative' }}>
                      <Hash size={20} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-muted)' }} />
                      <input 
                        type="text" 
                        value={verificationCode}
                        onChange={e => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="123456"
                        maxLength={6}
                        style={{ width: '100%', paddingLeft: '40px', fontSize: '20px', letterSpacing: '4px', textAlign: 'center' }}
                        required 
                      />
                    </div>
                  </div>
                  <button 
                    type="submit" 
                    disabled={isLoading || verificationCode.length < 6} 
                    style={{ 
                      width: '100%', padding: '16px', background: 'linear-gradient(135deg, var(--accent-primary) 0%, #2563eb 100%)', 
                      color: 'white', fontWeight: 600, fontSize: '16px', borderRadius: 'var(--radius-md)', 
                      display: 'flex', justifyContent: 'center', alignItems: 'center', border: 'none',
                      boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
                    }}
                  >
                    {isLoading ? <Loader2 size={20} className="animate-spin" /> : 'Подтвердить'}
                  </button>
                  <div style={{ textAlign: 'center', marginTop: '16px' }}>
                    <button type="button" onClick={() => setConfirmationResult(null)} style={{ background: 'transparent', color: 'var(--accent-primary)', fontSize: '14px', border: 'none' }}>
                      Изменить номер телефона
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
