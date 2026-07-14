import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { FINANCIAL_STRATEGIES } from '../lib/gemini';

export const useFinancialStrategy = () => {
  const [strategyId, setStrategyId] = useState<string>(() => {
    return localStorage.getItem('gemini_strategy') || 'none';
  });
  const [personalInstructions, setPersonalInstructions] = useState<string>(() => {
    return localStorage.getItem('gemini_instructions') || '';
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (!user) {
        if (active) {
          setStrategyId('none');
          setPersonalInstructions('');
        }
        return;
      }

      const fetchSettings = async () => {
        setLoading(true);
        try {
          const docRef = doc(db, 'userSettings', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists() && active) {
            const data = docSnap.data();
            if (data.strategyId) {
              setStrategyId(data.strategyId);
              localStorage.setItem('gemini_strategy', data.strategyId);
            }
            if (data.personalInstructions !== undefined) {
              setPersonalInstructions(data.personalInstructions);
              localStorage.setItem('gemini_instructions', data.personalInstructions);
            }
          }
        } catch (err) {
          console.error('Failed to load user settings from Firestore:', err);
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      };

      fetchSettings();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const saveSettings = async (newStrategyId: string, newInstructions: string) => {
    setStrategyId(newStrategyId);
    setPersonalInstructions(newInstructions);
    localStorage.setItem('gemini_strategy', newStrategyId);
    localStorage.setItem('gemini_instructions', newInstructions);

    const user = auth.currentUser;
    if (!user) return;

    try {
      await setDoc(doc(db, 'userSettings', user.uid), {
        strategyId: newStrategyId,
        personalInstructions: newInstructions,
        updatedAt: new Date()
      }, { merge: true });
    } catch (err) {
      console.error('Failed to save settings to Firestore:', err);
    }
  };

  const currentStrategy = FINANCIAL_STRATEGIES.find(s => s.id === strategyId) || FINANCIAL_STRATEGIES[0];

  return {
    strategyId,
    personalInstructions,
    currentStrategy,
    saveSettings,
    loading
  };
};
