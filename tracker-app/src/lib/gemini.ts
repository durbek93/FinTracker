/**
 * gemini.ts — AI service module for Finance Tracker
 *
 * Security: The API key is NEVER stored in code or .env.
 * It is read from localStorage (set by the user in Settings).
 * This is the BYOK (Bring Your Own Key) approach.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const STORAGE_KEY = 'gemini_api_key';

// ─── Key Management ────────────────────────────────────────────────────────────

export const getGeminiKey = (): string | null => localStorage.getItem(STORAGE_KEY);

export const setGeminiKey = (key: string): void => {
  localStorage.setItem(STORAGE_KEY, key.trim());
};

export const removeGeminiKey = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

export const hasGeminiKey = (): boolean => {
  const key = getGeminiKey();
  return !!key && key.length > 10;
};

// ─── Client factory ─────────────────────────────────────────────────────────────

const getClient = (): GoogleGenerativeAI => {
  const key = getGeminiKey();
  if (!key) throw new Error('NO_API_KEY');
  return new GoogleGenerativeAI(key);
};

// ─── Financial Strategies Presets ──────────────────────────────────────────────

export interface FinancialStrategy {
  id: string;
  name: string;
  description: string;
  instruction: string;
}

export const FINANCIAL_STRATEGIES: FinancialStrategy[] = [
  {
    id: 'none',
    name: 'Без стратегии',
    description: 'Обычный анализ расходов и общие рекомендации.',
    instruction: 'Давай общие рекомендации по оптимизации бюджета без привязки к конкретной стратегии.'
  },
  {
    id: '50-30-20',
    name: 'Метод 50/30/20',
    description: '50% на нужды, 30% на желания, 20% на сбережения/долги.',
    instruction: 'Проанализируй расходы с точки зрения метода 50/30/20 (50% на необходимые нужды, 30% на личные нужды/желания, 20% на сбережения или инвестиции/долги) и укажи на отклонения от этого правила.'
  },
  {
    id: '15-25-50-10',
    name: 'Метод 15/25/50/10',
    description: '15% сбережения, 25% инвестиции, 50% потребности, 10% развлечения.',
    instruction: 'Проанализируй расходы с точки зрения стратегии 15/25/50/10 (15% на сбережения, 25% на долгосрочные инвестиции, 50% на жизненные потребности, 10% на развлечения и удовольствия) и укажи на отклонения от этого правила.'
  },
  {
    id: 'minimalism',
    name: 'Минимализм',
    description: 'Фокус только на самом необходимом, максимизация накоплений.',
    instruction: 'Анализируй расходы с позиции жесткого финансового минимализма. Фокусируйся только на самом необходимом, критикуй любые импульсивные или нерациональные покупки, предлагай жесткие меры для накопления капитала.'
  },
  {
    id: 'max-accumulation',
    name: 'Максимальное накопление',
    description: 'Откладывание от 70% дохода, агрессивное сокращение расходов.',
    instruction: 'Анализируй расходы с позиции агрессивного накопления средств (цель — откладывать от 70% доходов). Фокусируйся на поиске максимальной выгоды, инвестициях и тотальном урезании необязательных трат.'
  }
];

// ─── Feature 1: Smart Input — parse free-text or receipt image into transaction fields ──

export interface ParsedTransaction {
  amount: number;
  currency: 'UZS' | 'USD';
  type: 'expense' | 'income';
  suggestedCategoryName: string; // Category name in Russian to match against your categories
  suggestedAccountName?: string | null; // Optional matched account name
  note: string;
  tags?: string[];
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export const parseTransactionText = async (
  text: string,
  categoryNames: string[],
  currentDate: string,     // YYYY-MM-DD format
  currentTime: string,     // HH:mm format
  accountNames: string[] = [],
  existingTags: string[] = []
): Promise<ParsedTransaction> => {
  const client = getClient();
  
  const systemInstruction = `Ты — специализированный финансовый парсер транзакций. Твоя задача — извлечь параметры финансовой операции из свободного текста пользователя и вернуть строго JSON-объект.

Правила формирования JSON:
- amount: число (только цифры, без пробелов. "150 тысяч" = 150000, "2 млн" = 2000000)
- currency: "UZS" или "USD"
- type: "expense" или "income"
- suggestedCategoryName: выбери ОДНО наиболее подходящее название из переданного списка категорий, или напиши своё, если ничего не подходит.
- suggestedAccountName: если в тексте упомянут счёт/карта (например, из списка доступных счетов), верни его точное название из списка, иначе null.
- note: краткое описание (до 40 символов, без хэштегов)
- tags: массив строк-тегов (без символа #, в нижнем регистре), если в тексте есть #теги или очевидные метки контекста; иначе []
- date: определи дату из текста и верни в формате YYYY-MM-DD. Учитывай относительные слова ("вчера", "позавчера"). Если в тексте дата не указана, верни null.
- time: определи время из текста и верни в формате HH:mm. Если время не указано, верни null.

ВАЖНО: Если текст бессмысленный, не содержит информации о транзакции или не относится к финансам, верни JSON строго в таком формате: {"error": "Текст не распознан как транзакция."}

Ответ должен содержать ТОЛЬКО валидный JSON-объект без разметки markdown (без \`\`\`json ... \`\`\`) и комментариев.`;

  const model = client.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    systemInstruction
  });

  const prompt = `Текущая дата: ${currentDate}
Текущее время: ${currentTime}
Доступные категории: ${categoryNames.join(', ')}
${accountNames.length > 0 ? `Доступные счета: ${accountNames.join(', ')}\n` : ''}${existingTags.length > 0 ? `Популярные теги пользователя: ${existingTags.join(', ')}\n` : ''}
Текст пользователя для распознавания: "${text}"`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();

  // Strip possible markdown code fences
  const jsonStr = raw.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim();

  const parsed = JSON.parse(jsonStr);
  if (parsed.error) throw new Error(parsed.error);

  const usage = result.response.usageMetadata;
  if (usage) {
    parsed.usageMetadata = {
      promptTokenCount: usage.promptTokenCount,
      candidatesTokenCount: usage.candidatesTokenCount,
      totalTokenCount: usage.totalTokenCount
    };
  }

  return parsed as ParsedTransaction;
};

// ─── Client-side image compression for fast Vision scanning ───────────────────

export const compressImageToBase64 = (
  file: File,
  maxDim = 1024,
  quality = 0.8
): Promise<{ base64: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Не удалось прочитать файл изображения'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Некорректный формат изображения'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context недоступен'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1] || '';
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
};

export const parseReceiptImage = async (
  file: File,
  categoryNames: string[],
  accountNames: string[],
  currentDate: string,
  currentTime: string
): Promise<ParsedTransaction> => {
  const client = getClient();
  const { base64, mimeType } = await compressImageToBase64(file);

  const systemInstruction = `Ты — экспертный OCR-парсер чеков и банковских скриншотов (Payme, Click, Uzum Bank, Humo, Uzcard, кассовые чеки).
Извлеки итоговую сумму, валюту, тип операции, подходящую категорию, счёт (если видна карта/кошелёк), дату, время и краткое название магазина/получателя.

Верни строго JSON:
{
  "amount": число (итоговая сумма к оплате без пробелов),
  "currency": "UZS" или "USD",
  "type": "expense" или "income",
  "suggestedCategoryName": "название из списка категорий",
  "suggestedAccountName": "название счёта из списка или null",
  "note": "название магазина/сервиса (до 40 символов)",
  "tags": ["чек"],
  "date": "YYYY-MM-DD или null",
  "time": "HH:mm или null"
}
Если на фото нет чека, квитанции или финансовой операции, верни: {"error": "На изображении не найден чек или сумма операции."}`;

  const model = client.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction,
  });

  const prompt = `Текущая дата: ${currentDate}, время: ${currentTime}.
Доступные категории: ${categoryNames.join(', ')}.
Доступные счета: ${accountNames.join(', ')}.
Распознай чек или скриншот перевода:`;

  const result = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: base64,
        mimeType,
      },
    },
  ]);

  const raw = result.response.text().trim();
  const jsonStr = raw.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim();
  const parsed = JSON.parse(jsonStr);
  if (parsed.error) throw new Error(parsed.error);

  const usage = result.response.usageMetadata;
  if (usage) {
    parsed.usageMetadata = {
      promptTokenCount: usage.promptTokenCount,
      candidatesTokenCount: usage.candidatesTokenCount,
      totalTokenCount: usage.totalTokenCount,
    };
  }

  return parsed as ParsedTransaction;
};

// ─── Feature 2: AI Analyst — monthly financial advice ─────────────────────────

export interface AnalystReport {
  summary: string;   // 1-2 sentence summary
  insights: string[]; // 2-4 bullet points
  advice: string[];   // 2-3 actionable tips
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface FinancialStats {
  totalExpenses: number;
  categorizedExpensesTotal: number;
  totalIncome: number;
  expensesByCategory: { category: string; amount: number; percentage: number }[];
  incomesByCategory: { category: string; amount: number; percentage: number }[];
  usdPoolRemaining: number;
  categoryBudgets?: { category: string; spent: number; limit: number; pct: number }[];
  burnRate?: {
    avgDailyExpense: number;
    projectedMonthExpense: number | null;
    totalMonthlyBudget: number;
  } | null;
  goalsSummary?: {
    count: number;
    totalSavedUZS: number;
    totalTargetUZS: number;
  };
  debtsSummary?: {
    lentUZS: number;
    borrowedUZS: number;
  };
  monthlySubscriptionsUZS?: number;
}

export const getFinancialAdvice = async (
  stats: FinancialStats,
  strategyId: string = 'none',
  personalInstructions: string = ''
): Promise<AnalystReport> => {
  const client = getClient();
  
  const strategy = FINANCIAL_STRATEGIES.find(s => s.id === strategyId) || FINANCIAL_STRATEGIES[0];

  let systemInstruction = `Ты — опытный финансовый советник. Проанализируй агрегированную статистику пользователя за выбранный период (включая выполнение лимитов по категориям, темп трат Burn Rate, прогресс по копилкам, долгам и регулярным подпискам, если они переданы) и верни персональные советы по оптимизации бюджета в формате JSON.
Нейросетям сложно считать точные суммы, поэтому тебе передаются уже посчитанные итоговые цифры. Опирайся строго на них.

Ответ должен быть строго в формате JSON:
{
  "summary": "краткое резюме за период (1-2 предложения)",
  "insights": ["наблюдение 1", "наблюдение 2", "наблюдение 3"],
  "advice": ["совет 1", "совет 2", "совет 3"]
}

Правила:
- Пиши на русском языке.
- Будь конкретным, конструктивным и дружелюбным.
- Ответ должен содержать ТОЛЬКО валидный JSON-объект без разметки markdown (без \`\`\`json ... \`\`\`).`;

  if (strategy.id !== 'none') {
    systemInstruction += `\n\nФИНАНСОВАЯ СТРАТЕГИЯ ПОЛЬЗОВАТЕЛЯ:\n${strategy.instruction}`;
  }
  if (personalInstructions.trim()) {
    systemInstruction += `\n\nДОПОЛНИТЕЛЬНЫЕ УКАЗАНИЯ ПОЛЬЗОВАТЕЛЯ:\n${personalInstructions.trim()}`;
  }

  const model = client.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    systemInstruction
  });

  const prompt = `Статистика расходов, доходов и планов:\n${JSON.stringify(stats, null, 2)}`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().trim();
  const jsonStr = raw.replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim();

  const report = JSON.parse(jsonStr) as AnalystReport;

  const usage = result.response.usageMetadata;
  if (usage) {
    console.log(`[Gemini Analyst] Tokens: prompt=${usage.promptTokenCount}, candidates=${usage.candidatesTokenCount}, total=${usage.totalTokenCount}`);
    report.usageMetadata = {
      promptTokenCount: usage.promptTokenCount,
      candidatesTokenCount: usage.candidatesTokenCount,
      totalTokenCount: usage.totalTokenCount
    };
  }

  return report;
};
