import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { QuickTemplate } from '../types';

const CBU_CACHE_KEY = 'cbu_usd_rate_cache_v1';
const TEMPLATES_STORAGE_KEY = 'fintracker_quick_templates_v1';

interface CachedRate {
  rate: number;
  date: string;
  fetchedAt: number;
}

/**
 * Получает официальный курс USD Центрального Банка РУз (cbu.uz)
 * с локальным кэшированием на 6 часов и fallback при отсутствии сети.
 */
export async function fetchCbuUsdRate(forceRefresh = false): Promise<{ rate: number; date: string } | null> {
  try {
    if (!forceRefresh) {
      const raw = localStorage.getItem(CBU_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as CachedRate;
        const sixHoursMs = 6 * 60 * 60 * 1000;
        if (cached.rate > 0 && Date.now() - cached.fetchedAt < sixHoursMs) {
          return { rate: cached.rate, date: cached.date };
        }
      }
    }

    const res = await fetch('https://cbu.uz/ru/arkhiv-kursov-valyut/json/USD/');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const item = Array.isArray(data) ? data[0] : data;
    const parsedRate = Math.round(parseFloat(item?.Rate));
    const rateDate = item?.Date || new Date().toLocaleDateString('ru-RU');

    if (!isNaN(parsedRate) && parsedRate > 0) {
      const toCache: CachedRate = {
        rate: parsedRate,
        date: rateDate,
        fetchedAt: Date.now(),
      };
      localStorage.setItem(CBU_CACHE_KEY, JSON.stringify(toCache));
      return { rate: parsedRate, date: rateDate };
    }
  } catch (err) {
    console.warn('Не удалось обновить курс ЦБ РУз из сети, проверяем кэш:', err);
    try {
      const raw = localStorage.getItem(CBU_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as CachedRate;
        if (cached.rate > 0) return { rate: cached.rate, date: cached.date };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Быстрые шаблоны транзакций (Quick Templates) с синхронизацией в localStorage и userSettings/{uid}
 */
export function getLocalQuickTemplates(): QuickTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadQuickTemplates(): Promise<QuickTemplate[]> {
  const local = getLocalQuickTemplates();
  const user = auth.currentUser;
  if (!user) return local;

  try {
    const snap = await getDoc(doc(db, 'userSettings', user.uid));
    if (snap.exists()) {
      const data = snap.data();
      if (Array.isArray(data.quickTemplates)) {
        localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(data.quickTemplates));
        return data.quickTemplates as QuickTemplate[];
      }
    }
  } catch (err) {
    console.warn('Failed to fetch quickTemplates from Firestore, using local cache:', err);
  }
  return local;
}

export async function saveQuickTemplates(templates: QuickTemplate[]): Promise<void> {
  localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  const user = auth.currentUser;
  if (!user) return;

  try {
    await setDoc(
      doc(db, 'userSettings', user.uid),
      { quickTemplates: templates, updatedAt: new Date() },
      { merge: true }
    );
  } catch (err) {
    console.warn('Failed to sync quickTemplates to Firestore:', err);
  }
}
