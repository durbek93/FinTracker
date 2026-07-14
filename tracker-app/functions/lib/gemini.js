"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FINANCIAL_STRATEGIES = void 0;
exports.parseTransactionTextWithGemini = parseTransactionTextWithGemini;
exports.parseTransactionAudioWithGemini = parseTransactionAudioWithGemini;
exports.generateFinancialAdviceText = generateFinancialAdviceText;
const generative_ai_1 = require("@google/generative-ai");
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
async function parseTransactionTextWithGemini(geminiKey, text, accountNames, categoryNames, localDateStr, localTimeStr) {
    try {
        const ai = new generative_ai_1.GoogleGenerativeAI(geminiKey);
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
        const parsed = JSON.parse(rawText);
        const usage = result.response.usageMetadata;
        if (usage) {
            console.log(`[Gemini Parse Text] Tokens: prompt=${usage.promptTokenCount}, candidates=${usage.candidatesTokenCount}, total=${usage.totalTokenCount}`);
            parsed.usageMetadata = {
                promptTokenCount: usage.promptTokenCount,
                candidatesTokenCount: usage.candidatesTokenCount,
                totalTokenCount: usage.totalTokenCount
            };
        }
        return parsed;
    }
    catch (err) {
        console.error("Gemini Parse Error:", err);
        return null;
    }
}
/**
 * Parses user voice audio using Google Gemini API and returns a structured transaction intent.
 */
async function parseTransactionAudioWithGemini(geminiKey, audioBuffer, mimeType, accountNames, categoryNames, localDateStr, localTimeStr) {
    try {
        const ai = new generative_ai_1.GoogleGenerativeAI(geminiKey);
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
        const parsed = JSON.parse(rawText);
        const usage = result.response.usageMetadata;
        if (usage) {
            console.log(`[Gemini Parse Audio] Tokens: prompt=${usage.promptTokenCount}, candidates=${usage.candidatesTokenCount}, total=${usage.totalTokenCount}`);
            parsed.usageMetadata = {
                promptTokenCount: usage.promptTokenCount,
                candidatesTokenCount: usage.candidatesTokenCount,
                totalTokenCount: usage.totalTokenCount
            };
        }
        return parsed;
    }
    catch (err) {
        console.error("Gemini Audio Parse Error:", err);
        return null;
    }
}
exports.FINANCIAL_STRATEGIES = [
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
async function generateFinancialAdviceText(geminiKey, stats, strategyId, personalInstructions) {
    try {
        const ai = new generative_ai_1.GoogleGenerativeAI(geminiKey);
        const strategy = exports.FINANCIAL_STRATEGIES.find(s => s.id === strategyId) || exports.FINANCIAL_STRATEGIES[0];
        let systemInstruction = `Ты — опытный и дружелюбный финансовый советник. Проанализируй финансовую статистику пользователя за текущий месяц и составь персонализированный отчет и рекомендации на русском языке.
      
Форматируй отчет с использованием Markdown для Telegram:
- Используй эмодзи для наглядности.
- Выделяй жирным шрифтом ключевые показатели (например, суммы, проценты, категории).
- Делай текст структурированным и легко читаемым (с абзацами и списками).
      
Отчет должен содержать:
1. Краткий анализ общей картины (доходы vs расходы за месяц).
2. Несколько важных наблюдений о тратах (например, в каких категориях тратится больше всего).
3. Действенные и конкретные финансовые советы по экономии и накоплению, основанные на выбранной стратегии пользователя.`;
        if (strategy.id !== "none") {
            systemInstruction += `\n\nФИНАНСОВАЯ СТРАТЕГИЯ ПОЛЬЗОВАТЕЛЯ: ${strategy.name}\nИнструкция стратегии: ${strategy.instruction}`;
        }
        if (personalInstructions && personalInstructions.trim()) {
            systemInstruction += `\n\nДОПОЛНИТЕЛЬНЫЕ УКАЗАНИЯ ПОЛЬЗОВАТЕЛЯ:\n${personalInstructions.trim()}`;
        }
        const model = ai.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction
        });
        const prompt = `Статистика расходов и доходов за текущий месяц:\n${JSON.stringify(stats, null, 2)}`;
        const result = await model.generateContent(prompt);
        const adviceText = result.response.text().trim();
        const usage = result.response.usageMetadata;
        const response = { adviceText };
        if (usage) {
            response.usageMetadata = {
                promptTokenCount: usage.promptTokenCount,
                candidatesTokenCount: usage.candidatesTokenCount,
                totalTokenCount: usage.totalTokenCount
            };
        }
        return response;
    }
    catch (err) {
        console.error("Gemini Advice Error:", err);
        return null;
    }
}
//# sourceMappingURL=gemini.js.map