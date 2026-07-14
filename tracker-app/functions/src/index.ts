import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// Import modular services and types
import { calculateBalances, DBAccount, DBTransaction } from "./balances";
import {
  sendTelegramMessage,
  answerCallbackQuery,
  editMessageText,
  verifyTelegramInitData,
  getTelegramFile,
  downloadTelegramFile,
  sendTelegramVoice,
} from "./telegram";
import {
  parseTransactionTextWithGemini,
  parseTransactionAudioWithGemini,
  generateFinancialAdviceText,
  ParsedTransaction,
} from "./gemini";
import {
  getGoogleAccessToken,
  synthesizeSpeech,
  cleanMarkdownForTTS,
} from "./tts";

admin.initializeApp();
const db = admin.firestore();

// Define secrets
const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");

// Interface definitions
interface UserLink {
  userId: string;
  telegramId: string;
  createdAt: Timestamp;
}

interface PendingTx {
  chatId: number;
  messageId: number;
  amount: number;
  currency: "UZS" | "USD";
  type: "expense" | "income";
  note: string;
  date: string;
  accountId: string | null;
  categoryId: string | null;
  suggestedAccount: string | null;
  suggestedCategory: string | null;
  createdAt: Timestamp;
}

interface DBCategory {
  id: string;
  name: string;
  type: "expense" | "income" | "transfer";
  userId: string;
}

interface CallbackQuery {
  id: string;
  data: string;
  from: {
    id: number;
  };
  message: {
    message_id: number;
    chat: {
      id: number;
    };
  };
}

// Cloud Function 1: Webhook receiver for Telegram Bot
export const telegramWebhook = onRequest(
  { secrets: [TELEGRAM_BOT_TOKEN, GEMINI_API_KEY] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const botToken = TELEGRAM_BOT_TOKEN.value();
    const geminiKey = GEMINI_API_KEY.value();

    try {
      const update = req.body;
      console.log("Received Telegram update:", JSON.stringify(update));

      // Handle Callback Query (inline keyboard button clicks)
      if (update.callback_query) {
        await handleCallbackQuery(update.callback_query as CallbackQuery, botToken);
        res.status(200).send("OK");
        return;
      }

      const message = update.message;
      if (!message) {
        res.status(200).send("OK");
        return;
      }

      const chatId = message.chat.id;
      const telegramId = String(message.from.id);

      // 1. Handle Commands & Text Transactions
      if (message.text) {
        const text = message.text.trim();
        if (text.startsWith("/start")) {
          await handleStartCommand(chatId, text, telegramId, botToken);
          res.status(200).send("OK");
          return;
        }

        await handleTransactionText(chatId, message.message_id, text, telegramId, botToken, geminiKey, message.date);
        res.status(200).send("OK");
        return;
      }

      // 2. Handle Voice Transactions
      if (message.voice) {
        await handleTransactionVoice(chatId, message.message_id, message.voice, telegramId, botToken, geminiKey, message.date);
        res.status(200).send("OK");
        return;
      }
      res.status(200).send("OK");
    } catch (error: unknown) {
      console.error("Error in webhook execution:", error);
      // Always return 200 OK to Telegram to prevent retry loops on execution errors
      res.status(200).send("OK");
    }
  }
);

// Process /start command with atomic transactions and link expiration
async function handleStartCommand(chatId: number, text: string, telegramId: string, botToken: string) {
  const parts = text.split(" ");
  if (parts.length > 1) {
    const code = parts[1].trim();
    console.log(`Bot started with link code: ${code} for Telegram ID: ${telegramId}`);

    try {
      const codeRef = db.collection("linkCodes").doc(code);
      const linkRef = db.collection("telegramUsers").doc(telegramId);

      await db.runTransaction(async (transaction) => {
        const codeSnap = await transaction.get(codeRef);
        if (!codeSnap.exists) {
          throw new Error("INVALID_CODE");
        }

        const data = codeSnap.data();
        const createdAt = data?.createdAt as Timestamp | undefined;
        const userId = data?.userId as string | undefined;

        if (!userId) {
          throw new Error("INVALID_USER_ID");
        }

        // Check code expiration: 10 minutes (600,000 ms)
        const tenMinutes = 10 * 60 * 1000;
        const codeTime = createdAt?.toDate().getTime();
        if (!codeTime || (Date.now() - codeTime > tenMinutes)) {
          throw new Error("EXPIRED_CODE");
        }

        // Associate Telegram user in db
        transaction.set(linkRef, {
          userId: userId,
          telegramId: telegramId,
          timezoneOffset: -300, // Default to UZS timezone offset
          createdAt: FieldValue.serverTimestamp(),
        });

        // Clean up used code
        transaction.delete(codeRef);
      });

      await sendTelegramMessage(
        botToken,
        chatId,
        "🎉 <b>Учетная запись успешно связана!</b>\n\nТеперь вы можете писать свои траты прямо сюда. Например:\n<i>'купил продукты на 25000 с карты'</i>\n<i>'получил зп 1000 баксов на наличку'</i>"
      );
    } catch (e: unknown) {
      console.error("Link transaction failed:", e);
      const error = e as Error;
      if (error.message === "INVALID_CODE") {
        await sendTelegramMessage(
          botToken,
          chatId,
          "❌ Неверный код привязки. Пожалуйста, сгенерируйте новый код в настройках приложения."
        );
      } else if (error.message === "EXPIRED_CODE") {
        // Attempt to delete the expired code outside transaction
        await db.collection("linkCodes").doc(code).delete().catch(() => {});
        await sendTelegramMessage(
          botToken,
          chatId,
          "❌ Код привязки устарел (срок действия 10 минут). Пожалуйста, сгенерируйте новый код в настройках приложения."
        );
      } else {
        await sendTelegramMessage(botToken, chatId, "❌ Произошла ошибка. Повторите попытку привязки.");
      }
    }
  } else {
    await sendTelegramMessage(
      botToken,
      chatId,
      "👋 <b>Привет! Я бот для финансового трекера.</b>\n\nЧтобы вводить транзакции с клавиатуры или открывать отчеты, вам нужно связать аккаунт. Перейдите на наш сайт, откройте <b>Настройки</b> и нажмите <b>'Привязать Telegram'</b>."
    );
  }
}

// Process financial text entry using Gemini
async function handleTransactionText(
  chatId: number,
  userMessageId: number,
  text: string,
  telegramId: string,
  botToken: string,
  geminiKey: string,
  messageDate?: number
) {
  // Find linked user
  const userSnap = await db.collection("telegramUsers").doc(telegramId).get();
  if (!userSnap.exists) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "⚠️ Ваш Telegram-аккаунт не связан с базой данных.\nПерейдите в настройки приложения и нажмите <b>'Привязать Telegram'</b>, чтобы начать."
    );
    return;
  }

  const userData = userSnap.data() as UserLink & { timezoneOffset?: number };
  const { userId } = userData;
  const timezoneOffset = userData.timezoneOffset !== undefined ? userData.timezoneOffset : -300; // Default to UTC+5 (Uzbekistan)

  // Notify user that bot is typing/thinking (returns message data containing message_id)
  const thinkingMsg = await sendTelegramMessage(botToken, chatId, "🤖 <i>Думаю...</i>") as { result?: { message_id: number } } | null;
  const botMessageId = thinkingMsg?.result?.message_id;

  // Fetch user categories & accounts to pass to Gemini
  const categoriesSnap = await db.collection("categories").where("userId", "==", userId).get();
  const accountsSnap = await db.collection("accounts").where("userId", "==", userId).get();

  const categories = categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as DBCategory));
  const accounts = accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as DBAccount));

  if (accounts.length === 0) {
    const errorMsg = "❌ У вас нет созданных счетов. Пожалуйста, создайте счет в приложении.";
    if (botMessageId) {
      await editMessageText(botToken, chatId, botMessageId, errorMsg);
    } else {
      await sendTelegramMessage(botToken, chatId, errorMsg);
    }
    return;
  }

  const categoryNames = categories.map((c) => c.name);
  const accountNames = accounts.map((a) => a.name);

  const messageDateSec = messageDate || Math.floor(Date.now() / 1000);
  const messageUtcMs = messageDateSec * 1000;
  const messageLocalMs = messageUtcMs - (timezoneOffset * 60 * 1000);
  const messageLocalDate = new Date(messageLocalMs);

  const userLocalYear = messageLocalDate.getUTCFullYear();
  const userLocalMonth = String(messageLocalDate.getUTCMonth() + 1).padStart(2, "0");
  const userLocalDay = String(messageLocalDate.getUTCDate()).padStart(2, "0");
  const userLocalHours = String(messageLocalDate.getUTCHours()).padStart(2, "0");
  const userLocalMinutes = String(messageLocalDate.getUTCMinutes()).padStart(2, "0");

  const localDateStr = `${userLocalYear}-${userLocalMonth}-${userLocalDay}`;
  const localTimeStr = `${userLocalHours}:${userLocalMinutes}`;

  // Call modular Gemini service
  const parsedJson = await parseTransactionTextWithGemini(
    geminiKey,
    text,
    accountNames,
    categoryNames,
    localDateStr,
    localTimeStr
  );

  await processParsedTransaction(
    chatId,
    userMessageId,
    botMessageId,
    parsedJson,
    userId,
    timezoneOffset,
    localDateStr,
    localTimeStr,
    accounts,
    categories,
    botToken,
    false
  );
}

// Process voice transaction entry using Gemini
async function handleTransactionVoice(
  chatId: number,
  userMessageId: number,
  voice: { file_id: string; mime_type?: string },
  telegramId: string,
  botToken: string,
  geminiKey: string,
  messageDate?: number
) {
  // Find linked user
  const userSnap = await db.collection("telegramUsers").doc(telegramId).get();
  if (!userSnap.exists) {
    await sendTelegramMessage(
      botToken,
      chatId,
      "⚠️ Ваш Telegram-аккаунт не связан с базой данных.\nПерейдите в настройки приложения и нажмите <b>'Привязать Telegram'</b>, чтобы начать."
    );
    return;
  }

  const userData = userSnap.data() as UserLink & { timezoneOffset?: number };
  const { userId } = userData;
  const timezoneOffset = userData.timezoneOffset !== undefined ? userData.timezoneOffset : -300; // Default to UTC+5 (Uzbekistan)

  // Notify user that bot is typing/thinking (returns message data containing message_id)
  const thinkingMsg = await sendTelegramMessage(botToken, chatId, "🤖 <i>Слушаю аудио...</i>") as { result?: { message_id: number } } | null;
  const botMessageId = thinkingMsg?.result?.message_id;

  // Fetch user categories & accounts to pass to Gemini
  const categoriesSnap = await db.collection("categories").where("userId", "==", userId).get();
  const accountsSnap = await db.collection("accounts").where("userId", "==", userId).get();

  const categories = categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as DBCategory));
  const accounts = accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as DBAccount));

  if (accounts.length === 0) {
    const errorMsg = "❌ У вас нет созданных счетов. Пожалуйста, создайте счет в приложении.";
    if (botMessageId) {
      await editMessageText(botToken, chatId, botMessageId, errorMsg);
    } else {
      await sendTelegramMessage(botToken, chatId, errorMsg);
    }
    return;
  }

  const categoryNames = categories.map((c) => c.name);
  const accountNames = accounts.map((a) => a.name);

  const messageDateSec = messageDate || Math.floor(Date.now() / 1000);
  const messageUtcMs = messageDateSec * 1000;
  const messageLocalMs = messageUtcMs - (timezoneOffset * 60 * 1000);
  const messageLocalDate = new Date(messageLocalMs);

  const userLocalYear = messageLocalDate.getUTCFullYear();
  const userLocalMonth = String(messageLocalDate.getUTCMonth() + 1).padStart(2, "0");
  const userLocalDay = String(messageLocalDate.getUTCDate()).padStart(2, "0");
  const userLocalHours = String(messageLocalDate.getUTCHours()).padStart(2, "0");
  const userLocalMinutes = String(messageLocalDate.getUTCMinutes()).padStart(2, "0");

  const localDateStr = `${userLocalYear}-${userLocalMonth}-${userLocalDay}`;
  const localTimeStr = `${userLocalHours}:${userLocalMinutes}`;

  // Download voice file
  const filePath = await getTelegramFile(botToken, voice.file_id);
  if (!filePath) {
    const errorMsg = "❌ Не удалось получить путь к аудиофайлу от Telegram.";
    if (botMessageId) {
      await editMessageText(botToken, chatId, botMessageId, errorMsg);
    } else {
      await sendTelegramMessage(botToken, chatId, errorMsg);
    }
    return;
  }

  const audioBuffer = await downloadTelegramFile(botToken, filePath);
  if (!audioBuffer) {
    const errorMsg = "❌ Не удалось скачать аудиофайл с серверов Telegram.";
    if (botMessageId) {
      await editMessageText(botToken, chatId, botMessageId, errorMsg);
    } else {
      await sendTelegramMessage(botToken, chatId, errorMsg);
    }
    return;
  }

  const mimeType = voice.mime_type || "audio/ogg";

  // Call modular Gemini service for Audio
  const parsedJson = await parseTransactionAudioWithGemini(
    geminiKey,
    audioBuffer,
    mimeType,
    accountNames,
    categoryNames,
    localDateStr,
    localTimeStr
  );

  await processParsedTransaction(
    chatId,
    userMessageId,
    botMessageId,
    parsedJson,
    userId,
    timezoneOffset,
    localDateStr,
    localTimeStr,
    accounts,
    categories,
    botToken,
    true
  );
}

// Common function to process parsed transaction JSON
async function processParsedTransaction(
  chatId: number,
  userMessageId: number,
  botMessageId: number | undefined,
  parsedJson: ParsedTransaction | null,
  userId: string,
  timezoneOffset: number,
  localDateStr: string,
  localTimeStr: string,
  accounts: DBAccount[],
  categories: DBCategory[],
  botToken: string,
  isVoice: boolean
) {
  if (!parsedJson || parsedJson.intent === "other" || (parsedJson.intent === "add_transaction" && !parsedJson.amount)) {
    const errorMsg = isVoice
      ? "🤷‍♂️ Не удалось распознать финансовую операцию в голосовом сообщении.\nПопробуйте сказать, например:\n• <i>'потратил 15 тысяч сум на такси с основной карты'</i>"
      : "🤷‍♂️ Не удалось распознать команду или финансовую операцию в тексте.\nПопробуйте написать:\n• <i>'купил кофе за 15000 сум с основной карты'</i> (добавление транзакции)\n• <i>'какой баланс?'</i> (запрос баланса)";
    if (botMessageId) {
      await editMessageText(botToken, chatId, botMessageId, errorMsg);
    } else {
      await sendTelegramMessage(botToken, chatId, errorMsg);
    }
    return;
  }

  if (parsedJson.intent === "check_balance") {
    // Fetch all user transactions to calculate current balance
    const txsSnap = await db.collection("transactions").where("userId", "==", userId).get();
    const transactions = txsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as DBTransaction));

    // Calculate balances locally matching client logic
    const calculatedAccounts = calculateBalances(accounts, transactions);

    let balanceMsg = "💳 <b>Текущий баланс ваших счетов:</b>\n\n";
    let totalUZS = 0;
    let totalUSD = 0;

    calculatedAccounts.forEach((acc) => {
      const isUSD = acc.currency === "USD";
      const balance = isUSD ? acc.balanceUSD : acc.balanceUZS;

      if (!acc.excludeFromTotal) {
        if (isUSD) totalUSD += balance;
        else totalUZS += balance;
      }

      const formattedBalance = balance.toLocaleString("ru-RU") + (isUSD ? " $" : " UZS");
      balanceMsg += `• <b>${acc.name}</b>: ${formattedBalance}\n`;
    });

    balanceMsg += "\n═══════════════════\n";
    balanceMsg += `💰 <b>Итого общий баланс:</b>\n`;
    balanceMsg += `• ${totalUZS.toLocaleString("ru-RU")} UZS\n`;
    if (totalUSD > 0) {
      balanceMsg += `• ${totalUSD.toLocaleString("ru-RU")} $\n`;
    }

    if (botMessageId) {
      await editMessageText(botToken, chatId, botMessageId, balanceMsg);
    } else {
      await sendTelegramMessage(botToken, chatId, balanceMsg);
    }
    return;
  }

  if (parsedJson.intent === "get_advice") {
    const adviceMsg = "🤖 <i>Анализирую ваши траты за текущий месяц...</i>";
    let statusMsgId = botMessageId;
    if (statusMsgId) {
      await editMessageText(botToken, chatId, statusMsgId, adviceMsg);
    } else {
      const sent = await sendTelegramMessage(botToken, chatId, adviceMsg) as { result?: { message_id: number } } | null;
      statusMsgId = sent?.result?.message_id;
    }

    const settingsSnap = await db.collection("userSettings").doc(userId).get();
    let strategyId = "none";
    let personalInstructions = "";
    if (settingsSnap.exists) {
      const data = settingsSnap.data();
      strategyId = data?.strategyId || "none";
      personalInstructions = data?.personalInstructions || "";
    }

    const nowUtcMs = Date.now();
    const nowLocalMs = nowUtcMs - (timezoneOffset * 60 * 1000);
    const nowLocalDate = new Date(nowLocalMs);
    const startOfMonthLocal = new Date(Date.UTC(nowLocalDate.getUTCFullYear(), nowLocalDate.getUTCMonth(), 1, 0, 0, 0));
    const startOfMonthUtcMs = startOfMonthLocal.getTime() + (timezoneOffset * 60 * 1000);
    const startOfMonthIso = new Date(startOfMonthUtcMs).toISOString();

    const txsSnap = await db.collection("transactions")
      .where("userId", "==", userId)
      .where("date", ">=", startOfMonthIso)
      .get();
    const transactions = txsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as DBTransaction));

    const expenseTxs = transactions.filter(t => t.type === 'expense');
    const incomeTxs = transactions.filter(t => t.type === 'income');

    const totalIncome = incomeTxs.reduce((acc, t) => acc + (t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0)), 0);
    const totalExpenses = expenseTxs.reduce((acc, t) => acc + (t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0)), 0);

    const incCatTotals: Record<string, number> = {};
    incomeTxs.forEach(t => {
      const amt = t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0);
      const catId = t.categoryId || "unknown";
      incCatTotals[catId] = (incCatTotals[catId] || 0) + amt;
    });
    const incomesByCategory = Object.entries(incCatTotals).map(([id, amt]) => ({
      category: categories.find(c => c.id === id)?.name || 'Неизвестно',
      amount: amt,
      percentage: totalIncome > 0 ? Number(((amt / totalIncome) * 100).toFixed(1)) : 0
    })).sort((a,b) => b.amount - a.amount);

    const expCatTotals: Record<string, number> = {};
    expenseTxs.forEach(t => {
      const amt = t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0);
      const catId = t.categoryId || "unknown";
      expCatTotals[catId] = (expCatTotals[catId] || 0) + amt;
    });
    const expensesByCategory = Object.entries(expCatTotals).map(([id, amt]) => ({
      category: categories.find(c => c.id === id)?.name || 'Неизвестно',
      amount: amt,
      percentage: totalExpenses > 0 ? Number(((amt / totalExpenses) * 100).toFixed(1)) : 0
    })).sort((a,b) => b.amount - a.amount);

    const stats = {
      totalExpenses,
      totalIncome,
      expensesByCategory,
      incomesByCategory
    };

    const geminiKey = GEMINI_API_KEY.value();
    const adviceResponse = await generateFinancialAdviceText(
      geminiKey,
      stats,
      strategyId,
      personalInstructions
    );

    if (adviceResponse && adviceResponse.adviceText) {
      const { adviceText, usageMetadata } = adviceResponse;
      if (usageMetadata) {
        console.log(`[Gemini Bot Advice] Tokens: prompt=${usageMetadata.promptTokenCount}, candidates=${usageMetadata.candidatesTokenCount}, total=${usageMetadata.totalTokenCount}`);
      }

      if (statusMsgId) {
        await editMessageText(botToken, chatId, statusMsgId, adviceText);
      } else {
        await sendTelegramMessage(botToken, chatId, adviceText);
      }

      // Generate and send voice message of the advice (also)
      try {
        const cleanText = cleanMarkdownForTTS(adviceText);
        if (cleanText) {
          const accessToken = await getGoogleAccessToken();
          if (accessToken) {
            const voiceBuffer = await synthesizeSpeech(cleanText, accessToken);
            if (voiceBuffer) {
              await sendTelegramVoice(botToken, chatId, voiceBuffer);
            }
          }
        }
      } catch (voiceErr) {
        console.error("Error synthesizing or sending voice report:", voiceErr);
      }
    } else {
      const errorMsg = "❌ Не удалось получить финансовые рекомендации от ИИ. Попробуйте еще раз позже.";
      if (statusMsgId) {
        await editMessageText(botToken, chatId, statusMsgId, errorMsg);
      } else {
        await sendTelegramMessage(botToken, chatId, errorMsg);
      }
    }
    return;
  }

  // Extract variables
  const rawAmount = Number(parsedJson.amount);
  if (isNaN(rawAmount) || rawAmount <= 0) {
    console.error("Invalid transaction amount received from Gemini:", parsedJson.amount);
    const errorMsg = "❌ Не удалось распознать сумму транзакции. Пожалуйста, укажите сумму цифрами.";
    if (botMessageId) {
      await editMessageText(botToken, chatId, botMessageId, errorMsg);
    } else {
      await sendTelegramMessage(botToken, chatId, errorMsg);
    }
    return;
  }

  const amount = rawAmount;
  const currency = parsedJson.currency === "USD" ? "USD" : "UZS";
  const type = parsedJson.type === "income" ? "income" : "expense";
  const note = parsedJson.note || "";

  // Parse local date/time and convert to UTC ISO string
  const parsedDate = parsedJson.date || localDateStr;
  const parsedTime = parsedJson.time || localTimeStr;

  let dateIso = new Date().toISOString();
  try {
    const [year, month, day] = parsedDate.split("-").map(Number);
    const [hours, minutes] = parsedTime.split(":").map(Number);
    const localUtcMs = Date.UTC(year, month - 1, day, hours, minutes, 0);
    const transactionUtcMs = localUtcMs + (timezoneOffset * 60 * 1000);
    dateIso = new Date(transactionUtcMs).toISOString();
  } catch (e) {
    console.error("Error parsing date/time from Gemini response, fallback to current time:", e);
  }

  // Try to match category and account in db
  let matchedCategoryId: string | null = null;
  let matchedAccountId: string | null = null;

  const sugCat = parsedJson.suggestedCategory;
  if (sugCat) {
    const match = categories.find(
      (c) => c.name.toLowerCase() === sugCat.toLowerCase()
    );
    if (match) matchedCategoryId = match.id;
  }

  const sugAcc = parsedJson.suggestedAccount;
  if (sugAcc) {
    const match = accounts.find(
      (a) => a.name.toLowerCase() === sugAcc.toLowerCase()
    );
    if (match) matchedAccountId = match.id;
  }

  // If we only have 1 account in total, default to it
  if (!matchedAccountId && accounts.length === 1) {
    matchedAccountId = accounts[0].id;
  }

  // Execute mixed-mode logic
  if (matchedCategoryId && matchedAccountId) {
    // Both resolved -> insert immediately
    await db.collection("transactions").add({
      amount,
      currency,
      type,
      accountId: matchedAccountId,
      categoryId: matchedCategoryId,
      note,
      date: dateIso,
      userId,
      createdAt: FieldValue.serverTimestamp(),
    });

    const categoryName = categories.find((c) => c.id === matchedCategoryId)?.name;
    const accountName = accounts.find((a) => a.id === matchedAccountId)?.name;

    const successMsg = `✅ <b>Успешно добавлено!</b>\n\n💵 Сумма: ${amount.toLocaleString()} ${currency}\n📂 Категория: ${categoryName}\n💳 Счет: ${accountName}\n📝 Описание: ${note || "—"}`;
    if (botMessageId) {
      await editMessageText(botToken, chatId, botMessageId, successMsg);
    } else {
      await sendTelegramMessage(botToken, chatId, successMsg);
    }
  } else {
    // Some fields unresolved -> save to pending and ask via inline keyboard
    const targetMessageId = botMessageId || userMessageId;
    const pendingTxRef = db.collection("pendingTransactions").doc(String(chatId));
    await pendingTxRef.set({
      chatId,
      messageId: targetMessageId,
      amount,
      currency,
      type,
      note,
      date: dateIso,
      accountId: matchedAccountId,
      categoryId: matchedCategoryId,
      suggestedAccount: parsedJson.suggestedAccount,
      suggestedCategory: parsedJson.suggestedCategory,
      createdAt: FieldValue.serverTimestamp(),
    });

    await askClarification(chatId, targetMessageId, botToken, accounts, categories, matchedAccountId, matchedCategoryId, type);
  }
}

// Ask clarification via Telegram Inline Keyboard
async function askClarification(
  chatId: number,
  messageId: number,
  botToken: string,
  accounts: DBAccount[],
  categories: DBCategory[],
  accountId: string | null,
  categoryId: string | null,
  type: "income" | "expense" | "transfer"
) {
  if (!accountId) {
    // Ask for Account first
    const buttons = accounts.map((acc) => [
      { text: `${acc.name} (${acc.currency || "UZS"})`, callback_data: `sel_acc:${acc.id}` },
    ]);
    buttons.push([{ text: "❌ Отменить операцию", callback_data: "cancel_tx" }]);
    const replyMarkup = { inline_keyboard: buttons };
    await editMessageText(botToken, chatId, messageId, "💳 <b>Выберите счет для списания:</b>", replyMarkup);
  } else if (!categoryId) {
    // Ask for Category
    const filteredCats = categories.filter((c) => c.type === type);

    const buttons = [];
    // Group buttons in rows of 2 for clean layout
    for (let i = 0; i < filteredCats.length; i += 2) {
      const row = [];
      row.push({ text: filteredCats[i].name, callback_data: `sel_cat:${filteredCats[i].id}` });
      if (i + 1 < filteredCats.length) {
        row.push({ text: filteredCats[i + 1].name, callback_data: `sel_cat:${filteredCats[i + 1].id}` });
      }
      buttons.push(row);
    }
    buttons.push([{ text: "❌ Отменить операцию", callback_data: "cancel_tx" }]);

    const replyMarkup = { inline_keyboard: buttons };
    await editMessageText(botToken, chatId, messageId, "📂 <b>Выберите категорию расходов:</b>", replyMarkup);
  }
}

// Handle Callback Query (user clicked keyboard button)
async function handleCallbackQuery(callbackQuery: CallbackQuery, botToken: string) {
  const data = callbackQuery.data;
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const telegramId = String(callbackQuery.from.id);

  const pendingRef = db.collection("pendingTransactions").doc(String(chatId));

  // Handle transaction cancellation
  if (data === "cancel_tx") {
    await pendingRef.delete();
    await answerCallbackQuery(botToken, callbackQuery.id, "Операция отменена.");
    await editMessageText(botToken, chatId, messageId, "❌ <i>Операция отменена.</i>");
    return;
  }

  const pendingSnap = await pendingRef.get();

  if (!pendingSnap.exists) {
    await answerCallbackQuery(botToken, callbackQuery.id, "⚠️ Транзакция уже обработана или сессия истекла.");
    await editMessageText(botToken, chatId, messageId, "<i>Сессия транзакции истекла.</i>");
    return;
  }

  const txData = pendingSnap.data() as PendingTx;

  // Retrieve user categories & accounts
  const userSnap = await db.collection("telegramUsers").doc(telegramId).get();
  const { userId } = userSnap.data() as UserLink;

  const categoriesSnap = await db.collection("categories").where("userId", "==", userId).get();
  const accountsSnap = await db.collection("accounts").where("userId", "==", userId).get();
  const categories = categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() } as DBCategory));
  const accounts = accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as DBAccount));

  if (data.startsWith("sel_acc:")) {
    const accId = data.replace("sel_acc:", "");
    await pendingRef.update({ accountId: accId });
    await answerCallbackQuery(botToken, callbackQuery.id, "Счет выбран!");

    // Check if category is also resolved
    if (txData.categoryId) {
      await savePendingTransaction(pendingRef, { ...txData, accountId: accId }, categories, accounts, botToken, chatId, messageId);
    } else {
      // Transition to category selection on the same message
      await askClarification(chatId, messageId, botToken, accounts, categories, accId, null, txData.type);
    }
  } else if (data.startsWith("sel_cat:")) {
    const catId = data.replace("sel_cat:", "");
    await pendingRef.update({ categoryId: catId });
    await answerCallbackQuery(botToken, callbackQuery.id, "Категория выбрана!");

    // Check if account is also resolved
    if (txData.accountId) {
      await savePendingTransaction(pendingRef, { ...txData, categoryId: catId }, categories, accounts, botToken, chatId, messageId);
    } else {
      // Transition to account selection on the same message
      await askClarification(chatId, messageId, botToken, accounts, categories, null, catId, txData.type);
    }
  }
}

// Save complete pending transaction to Firestore
async function savePendingTransaction(
  pendingRef: admin.firestore.DocumentReference,
  tx: PendingTx,
  categories: DBCategory[],
  accounts: DBAccount[],
  botToken: string,
  chatId: number,
  messageId: number
) {
  // Get linked user
  const userSnap = await db.collection("telegramUsers").doc(String(chatId)).get();
  const { userId } = userSnap.data() as UserLink;

  await db.collection("transactions").add({
    amount: tx.amount,
    currency: tx.currency,
    type: tx.type,
    accountId: tx.accountId,
    categoryId: tx.categoryId,
    note: tx.note,
    date: tx.date,
    userId,
    createdAt: FieldValue.serverTimestamp(),
  });

  const categoryName = categories.find((c) => c.id === tx.categoryId)?.name;
  const accountName = accounts.find((a) => a.id === tx.accountId)?.name;

  await editMessageText(
    botToken,
    chatId,
    messageId,
    `✅ <b>Успешно добавлено!</b>\n\n💵 Сумма: ${tx.amount.toLocaleString()} ${tx.currency}\n📂 Категория: ${categoryName}\n💳 Счет: ${accountName}\n📝 Описание: ${tx.note || "—"}`
  );

  // Clean up pending transaction
  await pendingRef.delete();
}

// Cloud Function 2: Generate custom auth token for Telegram WebApp users
export const authTelegram = onCall(
  { secrets: [TELEGRAM_BOT_TOKEN] },
  async (request) => {
    const botToken = TELEGRAM_BOT_TOKEN.value();
    const { initData, timezoneOffset } = request.data;

    if (!initData) {
      throw new HttpsError("invalid-argument", "Missing Telegram initData.");
    }

    const { isValid, user } = verifyTelegramInitData(initData, botToken);

    if (!isValid || !user || !user.id) {
      throw new HttpsError("unauthenticated", "Invalid Telegram signature or expired session.");
    }

    const telegramId = String(user.id);
    const firebaseUid = `telegram:${telegramId}`;

    try {
      // 1. Check if user already linked
      const userLinkSnap = await db.collection("telegramUsers").doc(telegramId).get();
      let userId = "";

      if (userLinkSnap.exists) {
        userId = userLinkSnap.data()?.userId as string;
        if (timezoneOffset !== undefined) {
          await db.collection("telegramUsers").doc(telegramId).update({ timezoneOffset });
        }
      } else {
        // Create new account and link
        // Create Firebase Auth user
        let authUser;
        try {
          authUser = await admin.auth().getUser(firebaseUid);
        } catch (e: unknown) {
          const error = e as { code?: string };
          if (error.code === "auth/user-not-found") {
            const displayName = (user.first_name as string) + (user.last_name ? ` ${user.last_name as string}` : "");
            authUser = await admin.auth().createUser({
              uid: firebaseUid,
              displayName: displayName,
            });
          } else {
            throw e;
          }
        }

        userId = authUser.uid;

        // Save in links collection
        await db.collection("telegramUsers").doc(telegramId).set({
          userId: userId,
          telegramId: telegramId,
          timezoneOffset: timezoneOffset !== undefined ? timezoneOffset : -300, // Default to UZS timezone offset
          createdAt: FieldValue.serverTimestamp(),
        });
      }

      // 2. Generate custom token for the actual user account
      const customToken = await admin.auth().createCustomToken(userId);
      return { customToken };
    } catch (e: unknown) {
      console.error("Auth Telegram Error:", e);
      const error = e as Error;
      throw new HttpsError("internal", error.message || "Failed to authenticate.");
    }
  }
);
