import { useState, useEffect, useCallback } from 'react';
import { Lock, Fingerprint, Delete, LogOut } from 'lucide-react';
import {
  verifySecurityPin,
  hasBiometricEnabled,
  verifyBiometricUnlock,
  clearSecurityPin,
} from '../lib/securityLock';
import { auth } from '../firebase';

interface AppLockScreenProps {
  onUnlock: () => void;
}

export default function AppLockScreen({ onUnlock }: AppLockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(() => hasBiometricEnabled());

  const handleBiometric = useCallback(async () => {
    const ok = await verifyBiometricUnlock();
    if (ok) {
      onUnlock();
    }
  }, [onUnlock]);

  useEffect(() => {
    setBioAvailable(hasBiometricEnabled());
    if (hasBiometricEnabled()) {
      // Prompt biometric automatically on lock screen mount
      const timer = setTimeout(() => {
        handleBiometric();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [handleBiometric]);

  const handleDigit = useCallback(
    async (digit: string) => {
      if (pin.length >= 4) return;
      const next = pin + digit;
      setPin(next);
      setError(false);

      if (next.length === 4) {
        const valid = await verifySecurityPin(next);
        if (valid) {
          onUnlock();
        } else {
          setError(true);
          setTimeout(() => {
            setPin('');
            setError(false);
          }, 500);
        }
      }
    },
    [pin, onUnlock]
  );

  const handleBackspace = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  }, []);

  // Support hardware keyboard numbers & Backspace
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDigit, handleBackspace]);

  const handleResetViaRelogin = async () => {
    if (confirm('Сбросить PIN-код и выйти из аккаунта? Для входа потребуется заново авторизоваться.')) {
      clearSecurityPin();
      await auth.signOut();
      onUnlock();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px',
        userSelect: 'none',
      }}
    >
      <div
        className="glass-panel animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '340px',
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'rgba(59, 130, 246, 0.15)',
            color: 'var(--accent-primary)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Lock size={26} />
        </div>

        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Введите PIN-код</h3>
          <p className="text-muted" style={{ fontSize: '13px', margin: 0 }}>
            {error ? (
              <span style={{ color: 'var(--danger)', fontWeight: 600 }}>Неверный PIN-код</span>
            ) : (
              'Для доступа к FinTracker'
            )}
          </p>
        </div>

        {/* 4 PIN Dots */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            transform: error ? 'translateX(-6px)' : 'none',
            transition: 'transform 0.1s ease',
          }}
        >
          {[0, 1, 2, 3].map(idx => {
            const filled = idx < pin.length;
            return (
              <div
                key={idx}
                style={{
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  background: error
                    ? 'var(--danger)'
                    : filled
                    ? 'var(--accent-primary)'
                    : 'var(--bg-tertiary)',
                  border: `2px solid ${
                    error ? 'var(--danger)' : filled ? 'var(--accent-primary)' : 'var(--border-color)'
                  }`,
                  transform: filled ? 'scale(1.12)' : 'scale(1)',
                  transition: 'all 0.15s ease',
                }}
              />
            );
          })}
        </div>

        {/* Numeric Keypad */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '14px',
            width: '100%',
            maxWidth: '260px',
          }}
        >
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => handleDigit(d)}
              style={{
                height: '62px',
                borderRadius: '50%',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: '22px',
                fontWeight: 600,
                border: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                cursor: 'pointer',
              }}
            >
              {d}
            </button>
          ))}

          {/* Bottom row: Biometric | 0 | Backspace */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {bioAvailable && (
              <button
                type="button"
                onClick={handleBiometric}
                title="FaceID / TouchID"
                aria-label="Разблокировать по биометрии"
                style={{
                  width: '62px',
                  height: '62px',
                  borderRadius: '50%',
                  background: 'rgba(59, 130, 246, 0.14)',
                  color: 'var(--accent-primary)',
                  border: '1px solid rgba(59, 130, 246, 0.35)',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <Fingerprint size={26} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleDigit('0')}
            style={{
              height: '62px',
              borderRadius: '50%',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              fontSize: '22px',
              fontWeight: 600,
              border: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            0
          </button>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <button
              type="button"
              onClick={handleBackspace}
              disabled={pin.length === 0}
              aria-label="Стереть"
              style={{
                width: '62px',
                height: '62px',
                borderRadius: '50%',
                background: 'transparent',
                color: pin.length > 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                cursor: 'pointer',
                opacity: pin.length > 0 ? 1 : 0.4,
              }}
            >
              <Delete size={24} />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleResetViaRelogin}
          style={{
            fontSize: '12px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'transparent',
            marginTop: '4px',
          }}
        >
          <LogOut size={14} />
          <span>Забыли PIN? Выйти и сбросить</span>
        </button>
      </div>
    </div>
  );
}
