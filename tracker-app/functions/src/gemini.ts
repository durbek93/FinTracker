import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ParsedTransaction {
  intent: "add_transaction" | "check_balance" | "get_advice" | "other";
  amount?: number;
  currency?: "UZS" | "USD";
  type?: "expense" | "income";
  suggestedCategory?: string | null;
  suggestedAccount?: string | null;
  note?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:mm
}

const SYSTEM_INSTRUCTION = `Ты — специализированный финансовый ассистент. Твоя задача — проанализировать входящее сообщение пользователя (текст или аудио) и определить его намерение (intent).

Ты должен вернуть строго JSON-объект с полями:
- intent: "add_transaction" (если пользователь хочет добавить операцию расхода или дохода), "check_balance" (если пользователь спрашивает о балансе, остатке денег на счетах или в целом, например "какой баланс", "сколько денег"), "get_advice" (если пользователь просит провести финансовый анализ, дать совет по расходам, оптимизации бюджета, экономии или спрашивает "почему так много расходов") или "other" (любое другое сообщение).

Если intent === "add_transaction", заполни дополнительные поля:
- amount: число (сумма транзакции)
- currency: "UZS" или "USD" (определи по контексту, по умолчанию "UZS")
- type: "expense" (расход) или "income" (доход)
- suggestedCategory: одно точное название категории из предоставленного списка (или null, если нет подходящей)
- suggestedAccount: одно точное название счета из предоставленного списка (или null, если нет подходящей)
- note: краткое описание/заметка о покупке (до 40 символов)
- date: дата операции в формате YYYY-MM-DD (определи её относительно локальной даты пользователя. Учитывай относительные указатели времени вроде "вчера", "позавчера", "сегодня". Если дата не указана явно, верни локальную дату пользователя)
- time: время операции в формате HH:mm (если указано конкретное время в тексте, например "в 22:12", "в 10 утра". Если время не указано, верни локальное время пользователя)

ПРАВИЛА АССОЦИАЦИИ СЧЕТОВ:
- Учти, что счет 'KB MAIN' является основной картой (заработной картой) пользователя. Если пользователь упоминает 'основная карта', 'заработная карта', 'основная' или аналогично, сопоставляй это со счетом 'KB MAIN'. Не сопоставляй общие упоминания типа 'с карты' или 'на карту' автоматически с KB MAIN, если только пользователь прямо не указал, что карта основная или зарплатная.`;

/**
 * Parses user text using Google Gemini API and returns a structured transaction intent.
 */
export async function parseTransactionTextWithGemini(
  geminiKey: string,
  text: string,
  accountNames: string[],
  categoryNames: string[],
  localDateStr: string,
  localTimeStr: string
): Promise<ParsedTransaction | null> {
  try {
    const ai = new GoogleGenerativeAI(geminiKey);
    const model = ai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    const prompt = `Доступные счета: ${accountNames.join(", ")}
Доступные категории: ${categoryNames.join(", ")}
Локальная дата пользователя: ${localDateStr}
Локальное время пользователя: ${localTimeStr}

Входной текст: "${text}"`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const rawText = result.response.text().trim();
    return JSON.parse(rawText) as ParsedTransaction;
  } catch (err) {
    console.error("Gemini Parse Error:", err);
    return null;
  }
}

/**
 * Parses user voice audio using Google Gemini API and returns a structured transaction intent.
 */
export async function parseTransactionAudioWithGemini(
  geminiKey: string,
  audioBuffer: Buffer,
  mimeType: string,
  accountNames: string[],
  categoryNames: string[],
  localDateStr: string,
  localTimeStr: string
): Promise<ParsedTransaction | null> {
  try {
    const ai = new GoogleGenerativeAI(geminiKey);
    const model = ai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_INSTRUCTION,
    });

    const prompt = `Доступные счета: ${accountNames.join(", ")}
Доступные категории: ${categoryNames.join(", ")}
Локальная дата пользователя: ${localDateStr}
Локальное время пользователя: ${localTimeStr}

Входные данные — это аудиозапись с описанием транзакции. Распознай её и выдели финансовые параметры.`;

    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: audioBuffer.toString("base64"),
                mimeType: mimeType,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const rawText = result.response.text().trim();
    return JSON.parse(rawText) as ParsedTransaction;
  } catch (err) {
    console.error("Gemini Audio Parse Error:", err);
    return null;
  }
}

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

/**
 * Generates custom markdown financial advice text using Gemini.
 */
export async function generateFinancialAdviceText(
  geminiKey: string,
  stats: {
    totalExpenses: number;
    totalIncome: number;
    expensesByCategory: { category: string; amount: number; percentage: number }[];
    incomesByCategory: { category: string; amount: number; percentage: number }[];
  },
  strategyId: string,
  personalInstructions: string
): Promise<string | null> {
  try {
    const ai = new GoogleGenerativeAI(geminiKey);
    const model = ai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: `Ты — опытный и дружелюбный финансовый советник. Проанализируй финансовую статистику пользователя за текущий месяц и составь персонализированный отчет и рекомендации на русском языке.
      
Форматируй отчет с использованием Markdown для Telegram:
- Используй эмодзи для наглядности.
- Выделяй жирным шрифтом ключевые показатели (например, суммы, проценты, категории).
- Делай текст структурированным и легко читаемым (с абзацами и списками).
      
Отчет должен содержать:
1. Краткий анализ общей картины (доходы vs расходы за месяц).
2. Несколько важных наблюдений о тратах (например, в каких категориях тратится больше всего).
3. Действенные и конкретные финансовые советы по экономии и накоплению, основанные на выбранной стратегии пользователя.`
    });

    const strategy = FINANCIAL_STRATEGIES.find(s => s.id === strategyId) || FINANCIAL_STRATEGIES[0];

    let prompt = "";
    if (strategy.id !== "none") {
      prompt += `ФИНАНСОВАЯ СТРАТЕГИЯ ПОЛЬЗОВАТЕЛЯ: ${strategy.name}\nИнструкция стратегии: ${strategy.instruction}\n\n`;
    }
    if (personalInstructions && personalInstructions.trim()) {
      prompt += `ДОПОЛНИТЕЛЬНЫЕ УКАЗАНИЯ ПОЛЬЗОВАТЕЛЯ:\n${personalInstructions.trim()}\n\n`;
    }
    prompt += `Статистика расходов и доходов за текущий месяц:\n${JSON.stringify(stats, null, 2)}`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (err) {
    console.error("Gemini Advice Error:", err);
    return null;
  }
}


