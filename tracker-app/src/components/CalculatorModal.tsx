import React, { useState, useEffect, useCallback } from 'react';
import { X, Delete, Check } from 'lucide-react';

interface CalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (value: string) => void;
  initialValue?: string;
}

// Safe mathematical expression evaluator without eval
function evaluateExpression(expr: string): number | null {
  try {
    const cleanExpr = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/\s/g, '');
    if (!cleanExpr || !/^[\d\.\+\-\*\/%]+$/.test(cleanExpr)) return null;

    // Tokenize
    const tokens: (number | string)[] = [];
    let currentNumber = '';

    for (let i = 0; i < cleanExpr.length; i++) {
      const char = cleanExpr[i];
      if (/[\d\.]/.test(char)) {
        currentNumber += char;
      } else if (/[\+\-\*\/%]/.test(char)) {
        if (currentNumber !== '') {
          tokens.push(parseFloat(currentNumber));
          currentNumber = '';
        } else if (char === '-' && (i === 0 || /[\+\-\*\/]/.test(cleanExpr[i - 1]))) {
          // Negative number prefix
          currentNumber = '-';
          continue;
        }
        tokens.push(char);
      }
    }
    if (currentNumber !== '') {
      tokens.push(parseFloat(currentNumber));
    }

    if (tokens.length === 0) return null;

    // Handle percentage
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === '%') {
        const prev = tokens[i - 1];
        if (typeof prev === 'number') {
          tokens.splice(i - 1, 2, prev / 100);
          i--;
        }
      }
    }

    // Multiply and Divide first (left-to-right)
    const afterMulDiv: (number | string)[] = [];
    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];
      if (token === '*' || token === '/') {
        const prev = afterMulDiv.pop();
        const next = tokens[i + 1];
        if (typeof prev === 'number' && typeof next === 'number') {
          if (token === '/' && next === 0) return null; // Division by zero
          const result = token === '*' ? prev * next : prev / next;
          afterMulDiv.push(result);
          i += 2;
        } else {
          return null;
        }
      } else {
        afterMulDiv.push(token);
        i++;
      }
    }

    // Add and Subtract (left-to-right)
    let total = 0;
    let currentOp = '+';
    for (let j = 0; j < afterMulDiv.length; j++) {
      const token = afterMulDiv[j];
      if (typeof token === 'number') {
        if (currentOp === '+') total += token;
        else if (currentOp === '-') total -= token;
      } else if (typeof token === 'string') {
        currentOp = token;
      }
    }

    if (isNaN(total) || !isFinite(total)) return null;
    return total;
  } catch {
    return null;
  }
}

export default function CalculatorModal({
  isOpen,
  onClose,
  onApply,
  initialValue = ''
}: CalculatorModalProps) {
  const [expression, setExpression] = useState('');
  const [preview, setPreview] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const cleanInit = initialValue.replace(/\s/g, '').replace(',', '.');
      setExpression(cleanInit && !isNaN(Number(cleanInit)) ? cleanInit : '');
      setPreview('');
    }
  }, [isOpen, initialValue]);

  // Recalculate preview when expression changes
  useEffect(() => {
    if (!expression) {
      setPreview('');
      return;
    }
    const val = evaluateExpression(expression);
    if (val !== null) {
      // Format preview nicely
      const rounded = Math.round(val * 100) / 100;
      setPreview(new Intl.NumberFormat('ru-RU').format(rounded));
    } else {
      setPreview('');
    }
  }, [expression]);

  const handleInput = useCallback((val: string) => {
    setExpression(prev => {
      // Prevent double operators
      const lastChar = prev.slice(-1);
      const isOp = /[\+\-\×\÷]/.test(val);
      const isLastOp = /[\+\-\×\÷]/.test(lastChar);

      if (isOp && isLastOp) {
        return prev.slice(0, -1) + val;
      }
      if (isOp && prev === '' && val !== '-') {
        return '';
      }
      return prev + val;
    });
  }, []);

  const handleClear = () => {
    setExpression('');
    setPreview('');
  };

  const handleBackspace = () => {
    setExpression(prev => prev.slice(0, -1));
  };

  const handleEquals = () => {
    if (!expression) return;
    const val = evaluateExpression(expression);
    if (val !== null) {
      const rounded = Math.round(val * 100) / 100;
      setExpression(String(rounded));
    }
  };

  const handleApply = () => {
    if (!expression) {
      onClose();
      return;
    }
    const val = evaluateExpression(expression);
    if (val !== null) {
      const rounded = Math.round(val * 100) / 100;
      onApply(String(Math.abs(rounded)));
      onClose();
    } else {
      // If already a valid number
      const num = parseFloat(expression);
      if (!isNaN(num)) {
        onApply(String(Math.abs(num)));
        onClose();
      }
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handleInput(e.key);
      } else if (e.key === '.') {
        handleInput('.');
      } else if (e.key === '+') {
        handleInput('+');
      } else if (e.key === '-') {
        handleInput('-');
      } else if (e.key === '*') {
        handleInput('×');
      } else if (e.key === '/') {
        e.preventDefault();
        handleInput('÷');
      } else if (e.key === '%') {
        handleInput('%');
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleApply();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleInput, onClose]);

  if (!isOpen) return null;

  const btnStyle = (bg = 'var(--bg-tertiary)', color = 'var(--text-primary)', isAccent = false): React.CSSProperties => ({
    padding: '16px 0',
    fontSize: '20px',
    fontWeight: isAccent ? 700 : 600,
    borderRadius: 'var(--radius-md)',
    background: bg,
    color: color,
    border: '1px solid var(--border-color)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.1s, opacity 0.2s',
    userSelect: 'none',
  });

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      <div 
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '380px',
          padding: '24px',
          background: 'var(--bg-primary)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Калькулятор</h3>
          <button 
            type="button" 
            onClick={onClose} 
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: 'var(--text-muted)', 
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Display */}
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          padding: '16px',
          border: '1px solid var(--border-color)',
          textAlign: 'right',
          minHeight: '84px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          overflow: 'hidden'
        }}>
          <div style={{
            fontSize: '15px',
            color: 'var(--text-muted)',
            minHeight: '20px',
            overflowX: 'auto',
            whiteSpace: 'nowrap'
          }}>
            {expression || '0'}
          </div>
          <div style={{
            fontSize: '28px',
            fontWeight: 700,
            color: preview ? 'var(--accent-primary)' : 'var(--text-primary)',
            marginTop: '4px',
            overflowX: 'auto',
            whiteSpace: 'nowrap'
          }}>
            {preview || (expression ? expression : '0')}
          </div>
        </div>

        {/* Keypad Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '10px'
        }}>
          {/* Row 1 */}
          <button type="button" onClick={handleClear} style={btnStyle('var(--danger-bg)', 'var(--danger)')}>
            C
          </button>
          <button type="button" onClick={handleBackspace} style={btnStyle('var(--bg-tertiary)', 'var(--text-primary)')}>
            <Delete size={20} />
          </button>
          <button type="button" onClick={() => handleInput('%')} style={btnStyle('var(--bg-tertiary)', 'var(--text-primary)')}>
            %
          </button>
          <button type="button" onClick={() => handleInput('÷')} style={btnStyle('rgba(99,102,241,0.15)', 'var(--accent-primary)', true)}>
            ÷
          </button>

          {/* Row 2 */}
          <button type="button" onClick={() => handleInput('7')} style={btnStyle()}>7</button>
          <button type="button" onClick={() => handleInput('8')} style={btnStyle()}>8</button>
          <button type="button" onClick={() => handleInput('9')} style={btnStyle()}>9</button>
          <button type="button" onClick={() => handleInput('×')} style={btnStyle('rgba(99,102,241,0.15)', 'var(--accent-primary)', true)}>
            ×
          </button>

          {/* Row 3 */}
          <button type="button" onClick={() => handleInput('4')} style={btnStyle()}>4</button>
          <button type="button" onClick={() => handleInput('5')} style={btnStyle()}>5</button>
          <button type="button" onClick={() => handleInput('6')} style={btnStyle()}>6</button>
          <button type="button" onClick={() => handleInput('-')} style={btnStyle('rgba(99,102,241,0.15)', 'var(--accent-primary)', true)}>
            -
          </button>

          {/* Row 4 */}
          <button type="button" onClick={() => handleInput('1')} style={btnStyle()}>1</button>
          <button type="button" onClick={() => handleInput('2')} style={btnStyle()}>2</button>
          <button type="button" onClick={() => handleInput('3')} style={btnStyle()}>3</button>
          <button type="button" onClick={() => handleInput('+')} style={btnStyle('rgba(99,102,241,0.15)', 'var(--accent-primary)', true)}>
            +
          </button>

          {/* Row 5 */}
          <button type="button" onClick={() => handleInput('000')} style={btnStyle()}>000</button>
          <button type="button" onClick={() => handleInput('0')} style={btnStyle()}>0</button>
          <button type="button" onClick={() => handleInput('.')} style={btnStyle()}>.</button>
          <button type="button" onClick={handleEquals} style={btnStyle('var(--bg-secondary)', 'var(--accent-primary)', true)}>
            =
          </button>
        </div>

        {/* Apply Action Button */}
        <button
          type="button"
          onClick={handleApply}
          style={{
            marginTop: '4px',
            padding: '14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-primary)',
            color: '#fff',
            fontWeight: 600,
            fontSize: '16px',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
            transition: 'opacity 0.2s'
          }}
        >
          <Check size={20} />
          Подставить сумму
        </button>
      </div>
    </div>
  );
}
