"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.authTelegram = exports.telegramWebhook = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const admin = __importStar(require("firebase-admin"));
const firestore_1 = require("firebase-admin/firestore");
// Import modular services and types
const balances_1 = require("./balances");
const telegram_1 = require("./telegram");
const gemini_1 = require("./gemini");
const tts_1 = require("./tts");
admin.initializeApp();
const db = admin.firestore();
// Define secrets
const TELEGRAM_BOT_TOKEN = (0, params_1.defineSecret)("TELEGRAM_BOT_TOKEN");
const GEMINI_API_KEY = (0, params_1.defineSecret)("GEMINI_API_KEY");
// Cloud Function 1: Webhook receiver for Telegram Bot
exports.telegramWebhook = (0, https_1.onRequest)({ secrets: [TELEGRAM_BOT_TOKEN, GEMINI_API_KEY] }, async (req, res) => {
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
            await handleCallbackQuery(update.callback_query, botToken);
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
    }
    catch (error) {
        console.error("Error in webhook execution:", error);
        // Always return 200 OK to Telegram to prevent retry loops on execution errors
        res.status(200).send("OK");
    }
});
// Process /start command with atomic transactions and link expiration
async function handleStartCommand(chatId, text, telegramId, botToken) {
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
                const createdAt = data?.createdAt;
                const userId = data?.userId;
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
                    createdAt: firestore_1.FieldValue.serverTimestamp(),
                });
                // Clean up used code
                transaction.delete(codeRef);
            });
            await (0, telegram_1.sendTelegramMessage)(botToken, chatId, "🎉 <b>Учетная запись успешно связана!</b>\n\nТеперь вы можете писать свои траты прямо сюда. Например:\n<i>'купил продукты на 25000 с карты'</i>\n<i>'получил зп 1000 баксов на наличку'</i>");
        }
        catch (e) {
            console.error("Link transaction failed:", e);
            const error = e;
            if (error.message === "INVALID_CODE") {
                await (0, telegram_1.sendTelegramMessage)(botToken, chatId, "❌ Неверный код привязки. Пожалуйста, сгенерируйте новый код в настройках приложения.");
            }
            else if (error.message === "EXPIRED_CODE") {
                // Attempt to delete the expired code outside transaction
                await db.collection("linkCodes").doc(code).delete().catch(() => { });
                await (0, telegram_1.sendTelegramMessage)(botToken, chatId, "❌ Код привязки устарел (срок действия 10 минут). Пожалуйста, сгенерируйте новый код в настройках приложения.");
            }
            else {
                await (0, telegram_1.sendTelegramMessage)(botToken, chatId, "❌ Произошла ошибка. Повторите попытку привязки.");
            }
        }
    }
    else {
        await (0, telegram_1.sendTelegramMessage)(botToken, chatId, "👋 <b>Привет! Я бот для финансового трекера.</b>\n\nЧтобы вводить транзакции с клавиатуры или открывать отчеты, вам нужно связать аккаунт. Перейдите на наш сайт, откройте <b>Настройки</b> и нажмите <b>'Привязать Telegram'</b>.");
    }
}
// Process financial text entry using Gemini
async function handleTransactionText(chatId, userMessageId, text, telegramId, botToken, geminiKey, messageDate) {
    // Find linked user
    const userSnap = await db.collection("telegramUsers").doc(telegramId).get();
    if (!userSnap.exists) {
        await (0, telegram_1.sendTelegramMessage)(botToken, chatId, "⚠️ Ваш Telegram-аккаунт не связан с базой данных.\nПерейдите в настройки приложения и нажмите <b>'Привязать Telegram'</b>, чтобы начать.");
        return;
    }
    const userData = userSnap.data();
    const { userId } = userData;
    const timezoneOffset = userData.timezoneOffset !== undefined ? userData.timezoneOffset : -300; // Default to UTC+5 (Uzbekistan)
    // Notify user that bot is typing/thinking (returns message data containing message_id)
    const thinkingMsg = await (0, telegram_1.sendTelegramMessage)(botToken, chatId, "🤖 <i>Думаю...</i>");
    const botMessageId = thinkingMsg?.result?.message_id;
    // Fetch user categories & accounts to pass to Gemini
    const categoriesSnap = await db.collection("categories").where("userId", "==", userId).get();
    const accountsSnap = await db.collection("accounts").where("userId", "==", userId).get();
    const categories = categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const accounts = accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (accounts.length === 0) {
        const errorMsg = "❌ У вас нет созданных счетов. Пожалуйста, создайте счет в приложении.";
        if (botMessageId) {
            await (0, telegram_1.editMessageText)(botToken, chatId, botMessageId, errorMsg);
        }
        else {
            await (0, telegram_1.sendTelegramMessage)(botToken, chatId, errorMsg);
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
    const parsedJson = await (0, gemini_1.parseTransactionTextWithGemini)(geminiKey, text, accountNames, categoryNames, localDateStr, localTimeStr);
    await processParsedTransaction(chatId, userMessageId, botMessageId, parsedJson, userId, timezoneOffset, localDateStr, localTimeStr, accounts, categories, botToken, false);
}
// Process voice transaction entry using Gemini
async function handleTransactionVoice(chatId, userMessageId, voice, telegramId, botToken, geminiKey, messageDate) {
    // Find linked user
    const userSnap = await db.collection("telegramUsers").doc(telegramId).get();
    if (!userSnap.exists) {
        await (0, telegram_1.sendTelegramMessage)(botToken, chatId, "⚠️ Ваш Telegram-аккаунт не связан с базой данных.\nПерейдите в настройки приложения и нажмите <b>'Привязать Telegram'</b>, чтобы начать.");
        return;
    }
    const userData = userSnap.data();
    const { userId } = userData;
    const timezoneOffset = userData.timezoneOffset !== undefined ? userData.timezoneOffset : -300; // Default to UTC+5 (Uzbekistan)
    // Notify user that bot is typing/thinking (returns message data containing message_id)
    const thinkingMsg = await (0, telegram_1.sendTelegramMessage)(botToken, chatId, "🤖 <i>Слушаю аудио...</i>");
    const botMessageId = thinkingMsg?.result?.message_id;
    // Fetch user categories & accounts to pass to Gemini
    const categoriesSnap = await db.collection("categories").where("userId", "==", userId).get();
    const accountsSnap = await db.collection("accounts").where("userId", "==", userId).get();
    const categories = categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const accounts = accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (accounts.length === 0) {
        const errorMsg = "❌ У вас нет созданных счетов. Пожалуйста, создайте счет в приложении.";
        if (botMessageId) {
            await (0, telegram_1.editMessageText)(botToken, chatId, botMessageId, errorMsg);
        }
        else {
            await (0, telegram_1.sendTelegramMessage)(botToken, chatId, errorMsg);
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
    const filePath = await (0, telegram_1.getTelegramFile)(botToken, voice.file_id);
    if (!filePath) {
        const errorMsg = "❌ Не удалось получить путь к аудиофайлу от Telegram.";
        if (botMessageId) {
            await (0, telegram_1.editMessageText)(botToken, chatId, botMessageId, errorMsg);
        }
        else {
            await (0, telegram_1.sendTelegramMessage)(botToken, chatId, errorMsg);
        }
        return;
    }
    const audioBuffer = await (0, telegram_1.downloadTelegramFile)(botToken, filePath);
    if (!audioBuffer) {
        const errorMsg = "❌ Не удалось скачать аудиофайл с серверов Telegram.";
        if (botMessageId) {
            await (0, telegram_1.editMessageText)(botToken, chatId, botMessageId, errorMsg);
        }
        else {
            await (0, telegram_1.sendTelegramMessage)(botToken, chatId, errorMsg);
        }
        return;
    }
    const mimeType = voice.mime_type || "audio/ogg";
    // Call modular Gemini service for Audio
    const parsedJson = await (0, gemini_1.parseTransactionAudioWithGemini)(geminiKey, audioBuffer, mimeType, accountNames, categoryNames, localDateStr, localTimeStr);
    await processParsedTransaction(chatId, userMessageId, botMessageId, parsedJson, userId, timezoneOffset, localDateStr, localTimeStr, accounts, categories, botToken, true);
}
// Common function to process parsed transaction JSON
async function processParsedTransaction(chatId, userMessageId, botMessageId, parsedJson, userId, timezoneOffset, localDateStr, localTimeStr, accounts, categories, botToken, isVoice) {
    if (!parsedJson || parsedJson.intent === "other" || (parsedJson.intent === "add_transaction" && !parsedJson.amount)) {
        const errorMsg = isVoice
            ? "🤷‍♂️ Не удалось распознать финансовую операцию в голосовом сообщении.\nПопробуйте сказать, например:\n• <i>'потратил 15 тысяч сум на такси с основной карты'</i>"
            : "🤷‍♂️ Не удалось распознать команду или финансовую операцию в тексте.\nПопробуйте написать:\n• <i>'купил кофе за 15000 сум с основной карты'</i> (добавление транзакции)\n• <i>'какой баланс?'</i> (запрос баланса)";
        if (botMessageId) {
            await (0, telegram_1.editMessageText)(botToken, chatId, botMessageId, errorMsg);
        }
        else {
            await (0, telegram_1.sendTelegramMessage)(botToken, chatId, errorMsg);
        }
        return;
    }
    if (parsedJson.intent === "check_balance") {
        // Fetch all user transactions to calculate current balance
        const txsSnap = await db.collection("transactions").where("userId", "==", userId).get();
        const transactions = txsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Calculate balances locally matching client logic
        const calculatedAccounts = (0, balances_1.calculateBalances)(accounts, transactions);
        let balanceMsg = "💳 <b>Текущий баланс ваших счетов:</b>\n\n";
        let totalUZS = 0;
        let totalUSD = 0;
        calculatedAccounts.forEach((acc) => {
            const isUSD = acc.currency === "USD";
            const balance = isUSD ? acc.balanceUSD : acc.balanceUZS;
            if (!acc.excludeFromTotal) {
                if (isUSD)
                    totalUSD += balance;
                else
                    totalUZS += balance;
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
            await (0, telegram_1.editMessageText)(botToken, chatId, botMessageId, balanceMsg);
        }
        else {
            await (0, telegram_1.sendTelegramMessage)(botToken, chatId, balanceMsg);
        }
        return;
    }
    if (parsedJson.intent === "get_advice") {
        let adviceMsg = "🤖 <i>Анализирую ваши траты за текущий месяц...</i>";
        if (parsedJson.adviceStartDate) {
            const startStr = parsedJson.adviceStartDate.split("-").reverse().join(".");
            const endStr = (parsedJson.adviceEndDate || "").split("-").reverse().join(".");
            adviceMsg = `🤖 <i>Анализирую ваши траты за период c ${startStr} по ${endStr || 'сегодня'}...</i>`;
        }
        let statusMsgId = botMessageId;
        if (statusMsgId) {
            await (0, telegram_1.editMessageText)(botToken, chatId, statusMsgId, adviceMsg);
        }
        else {
            const sent = await (0, telegram_1.sendTelegramMessage)(botToken, chatId, adviceMsg);
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
            .get();
        const allTransactions = txsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Calculate current balances using all transactions
        const calculatedAccounts = (0, balances_1.calculateBalances)(accounts, allTransactions);
        let totalBalanceUZS = 0;
        let totalBalanceUSD = 0;
        calculatedAccounts.forEach((acc) => {
            const isUSD = acc.currency === "USD";
            const balance = isUSD ? acc.balanceUSD : acc.balanceUZS;
            if (!acc.excludeFromTotal) {
                if (isUSD)
                    totalBalanceUSD += balance;
                else
                    totalBalanceUZS += balance;
            }
        });
        // Parse date ranges
        let startDateIso = startOfMonthIso;
        let endDateIso = new Date(nowUtcMs).toISOString();
        if (parsedJson.adviceStartDate) {
            try {
                const [y, m, d] = parsedJson.adviceStartDate.split("-").map(Number);
                const localStartMs = Date.UTC(y, m - 1, d, 0, 0, 0);
                startDateIso = new Date(localStartMs + (timezoneOffset * 60 * 1000)).toISOString();
            }
            catch (e) {
                console.error("Error parsing adviceStartDate:", e);
            }
        }
        if (parsedJson.adviceEndDate) {
            try {
                const [y, m, d] = parsedJson.adviceEndDate.split("-").map(Number);
                const localEndMs = Date.UTC(y, m - 1, d, 23, 59, 59, 999);
                endDateIso = new Date(localEndMs + (timezoneOffset * 60 * 1000)).toISOString();
            }
            catch (e) {
                console.error("Error parsing adviceEndDate:", e);
            }
        }
        // Filter transactions locally
        const currentMonthTxs = allTransactions.filter(t => t.date && t.date >= startDateIso && t.date <= endDateIso);
        const expenseTxs = currentMonthTxs.filter(t => (t.type === 'expense' && t.excludeFromStats !== true) ||
            (t.type === 'transfer' && t.addToExpenses === true && t.excludeFromStats !== true));
        const incomeTxs = currentMonthTxs.filter(t => t.type === 'income' && t.excludeFromStats !== true);
        const totalIncome = incomeTxs.reduce((acc, t) => acc + (t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0)), 0);
        const totalExpenses = expenseTxs.reduce((acc, t) => acc + (t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0)), 0);
        const incCatTotals = {};
        incomeTxs.forEach(t => {
            const amt = t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0);
            const catId = t.categoryId || "unknown";
            incCatTotals[catId] = (incCatTotals[catId] || 0) + amt;
        });
        const incomesByCategory = Object.entries(incCatTotals).map(([id, amt]) => ({
            category: categories.find(c => c.id === id)?.name || 'Неизвестно',
            amount: amt,
            percentage: totalIncome > 0 ? Number(((amt / totalIncome) * 100).toFixed(1)) : 0
        })).sort((a, b) => b.amount - a.amount);
        const expCatTotals = {};
        expenseTxs.forEach(t => {
            const amt = t.currency === 'UZS' ? t.amount : (t.convertedAmount || 0);
            let catId = t.categoryId || "unknown";
            if (t.type === 'transfer') {
                catId = "transfer_expense";
            }
            expCatTotals[catId] = (expCatTotals[catId] || 0) + amt;
        });
        const expensesByCategory = Object.entries(expCatTotals).map(([id, amt]) => {
            let categoryName = 'Неизвестно';
            if (id === 'transfer_expense') {
                categoryName = 'Обмен валюты / Переводы';
            }
            else {
                categoryName = categories.find(c => c.id === id)?.name || 'Неизвестно';
            }
            return {
                category: categoryName,
                amount: amt,
                percentage: totalExpenses > 0 ? Number(((amt / totalExpenses) * 100).toFixed(1)) : 0
            };
        }).sort((a, b) => b.amount - a.amount);
        const stats = {
            totalExpenses,
            totalIncome,
            netSavings: totalIncome - totalExpenses,
            currentBalance: {
                totalUZS: totalBalanceUZS,
                totalUSD: totalBalanceUSD
            },
            expensesByCategory,
            incomesByCategory
        };
        const geminiKey = GEMINI_API_KEY.value();
        const adviceResponse = await (0, gemini_1.generateFinancialAdviceText)(geminiKey, stats, strategyId, personalInstructions);
        if (adviceResponse && adviceResponse.adviceText) {
            const { adviceText, usageMetadata } = adviceResponse;
            if (usageMetadata) {
                console.log(`[Gemini Bot Advice] Tokens: prompt=${usageMetadata.promptTokenCount}, candidates=${usageMetadata.candidatesTokenCount}, total=${usageMetadata.totalTokenCount}`);
            }
            const chunks = splitMessage(adviceText, 3000);
            let editSuccess = false;
            if (statusMsgId) {
                editSuccess = await (0, telegram_1.editMessageText)(botToken, chatId, statusMsgId, chunks[0]);
                if (editSuccess) {
                    for (let i = 1; i < chunks.length; i++) {
                        await (0, telegram_1.sendTelegramMessage)(botToken, chatId, chunks[i]);
                    }
                }
                else {
                    // If editing failed, delete the status message and send everything fresh
                    await (0, telegram_1.deleteTelegramMessage)(botToken, chatId, statusMsgId).catch(() => { });
                    for (const chunk of chunks) {
                        await (0, telegram_1.sendTelegramMessage)(botToken, chatId, chunk);
                    }
                }
            }
            else {
                for (const chunk of chunks) {
                    await (0, telegram_1.sendTelegramMessage)(botToken, chatId, chunk);
                }
            }
            // Generate and send voice message of the advice (also)
            try {
                const cleanText = (0, tts_1.cleanMarkdownForTTS)(adviceText);
                if (cleanText) {
                    const accessToken = await (0, tts_1.getGoogleAccessToken)();
                    if (accessToken) {
                        // Slicing to 1500 characters (max ~3000 bytes) to stay safely below TTS 5000-byte API limit
                        const ttsText = cleanText.length > 1500 ? cleanText.slice(0, 1500) + "..." : cleanText;
                        const voiceBuffer = await (0, tts_1.synthesizeSpeech)(ttsText, accessToken);
                        if (voiceBuffer) {
                            await (0, telegram_1.sendTelegramVoice)(botToken, chatId, voiceBuffer);
                        }
                    }
                }
            }
            catch (voiceErr) {
                console.error("Error synthesizing or sending voice report:", voiceErr);
            }
        }
        else {
            const errorMsg = "❌ Не удалось получить финансовые рекомендации от ИИ. Попробуйте еще раз позже.";
            let editSuccess = false;
            if (statusMsgId) {
                editSuccess = await (0, telegram_1.editMessageText)(botToken, chatId, statusMsgId, errorMsg);
            }
            if (!editSuccess) {
                await (0, telegram_1.sendTelegramMessage)(botToken, chatId, errorMsg);
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
            await (0, telegram_1.editMessageText)(botToken, chatId, botMessageId, errorMsg);
        }
        else {
            await (0, telegram_1.sendTelegramMessage)(botToken, chatId, errorMsg);
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
    }
    catch (e) {
        console.error("Error parsing date/time from Gemini response, fallback to current time:", e);
    }
    // Try to match category and account in db
    let matchedCategoryId = null;
    let matchedAccountId = null;
    const sugCat = parsedJson.suggestedCategory;
    if (sugCat) {
        const match = categories.find((c) => c.name.toLowerCase() === sugCat.toLowerCase());
        if (match)
            matchedCategoryId = match.id;
    }
    const sugAcc = parsedJson.suggestedAccount;
    if (sugAcc) {
        const match = accounts.find((a) => a.name.toLowerCase() === sugAcc.toLowerCase());
        if (match)
            matchedAccountId = match.id;
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        const categoryName = categories.find((c) => c.id === matchedCategoryId)?.name;
        const accountName = accounts.find((a) => a.id === matchedAccountId)?.name;
        const successMsg = `✅ <b>Успешно добавлено!</b>\n\n💵 Сумма: ${amount.toLocaleString()} ${currency}\n📂 Категория: ${categoryName}\n💳 Счет: ${accountName}\n📝 Описание: ${note || "—"}`;
        if (botMessageId) {
            await (0, telegram_1.editMessageText)(botToken, chatId, botMessageId, successMsg);
        }
        else {
            await (0, telegram_1.sendTelegramMessage)(botToken, chatId, successMsg);
        }
    }
    else {
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
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
        await askClarification(chatId, targetMessageId, botToken, accounts, categories, matchedAccountId, matchedCategoryId, type);
    }
}
// Ask clarification via Telegram Inline Keyboard
async function askClarification(chatId, messageId, botToken, accounts, categories, accountId, categoryId, type) {
    if (!accountId) {
        // Ask for Account first
        const buttons = accounts.map((acc) => [
            { text: `${acc.name} (${acc.currency || "UZS"})`, callback_data: `sel_acc:${acc.id}` },
        ]);
        buttons.push([{ text: "❌ Отменить операцию", callback_data: "cancel_tx" }]);
        const replyMarkup = { inline_keyboard: buttons };
        await (0, telegram_1.editMessageText)(botToken, chatId, messageId, "💳 <b>Выберите счет для списания:</b>", replyMarkup);
    }
    else if (!categoryId) {
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
        await (0, telegram_1.editMessageText)(botToken, chatId, messageId, "📂 <b>Выберите категорию расходов:</b>", replyMarkup);
    }
}
// Handle Callback Query (user clicked keyboard button)
async function handleCallbackQuery(callbackQuery, botToken) {
    const data = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const telegramId = String(callbackQuery.from.id);
    const pendingRef = db.collection("pendingTransactions").doc(String(chatId));
    // Handle transaction cancellation
    if (data === "cancel_tx") {
        await pendingRef.delete();
        await (0, telegram_1.answerCallbackQuery)(botToken, callbackQuery.id, "Операция отменена.");
        await (0, telegram_1.editMessageText)(botToken, chatId, messageId, "❌ <i>Операция отменена.</i>");
        return;
    }
    const pendingSnap = await pendingRef.get();
    if (!pendingSnap.exists) {
        await (0, telegram_1.answerCallbackQuery)(botToken, callbackQuery.id, "⚠️ Транзакция уже обработана или сессия истекла.");
        await (0, telegram_1.editMessageText)(botToken, chatId, messageId, "<i>Сессия транзакции истекла.</i>");
        return;
    }
    const txData = pendingSnap.data();
    // Retrieve user categories & accounts
    const userSnap = await db.collection("telegramUsers").doc(telegramId).get();
    const { userId } = userSnap.data();
    const categoriesSnap = await db.collection("categories").where("userId", "==", userId).get();
    const accountsSnap = await db.collection("accounts").where("userId", "==", userId).get();
    const categories = categoriesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const accounts = accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (data.startsWith("sel_acc:")) {
        const accId = data.replace("sel_acc:", "");
        await pendingRef.update({ accountId: accId });
        await (0, telegram_1.answerCallbackQuery)(botToken, callbackQuery.id, "Счет выбран!");
        // Check if category is also resolved
        if (txData.categoryId) {
            await savePendingTransaction(pendingRef, { ...txData, accountId: accId }, categories, accounts, botToken, chatId, messageId);
        }
        else {
            // Transition to category selection on the same message
            await askClarification(chatId, messageId, botToken, accounts, categories, accId, null, txData.type);
        }
    }
    else if (data.startsWith("sel_cat:")) {
        const catId = data.replace("sel_cat:", "");
        await pendingRef.update({ categoryId: catId });
        await (0, telegram_1.answerCallbackQuery)(botToken, callbackQuery.id, "Категория выбрана!");
        // Check if account is also resolved
        if (txData.accountId) {
            await savePendingTransaction(pendingRef, { ...txData, categoryId: catId }, categories, accounts, botToken, chatId, messageId);
        }
        else {
            // Transition to account selection on the same message
            await askClarification(chatId, messageId, botToken, accounts, categories, null, catId, txData.type);
        }
    }
}
// Save complete pending transaction to Firestore
async function savePendingTransaction(pendingRef, tx, categories, accounts, botToken, chatId, messageId) {
    // Get linked user
    const userSnap = await db.collection("telegramUsers").doc(String(chatId)).get();
    const { userId } = userSnap.data();
    await db.collection("transactions").add({
        amount: tx.amount,
        currency: tx.currency,
        type: tx.type,
        accountId: tx.accountId,
        categoryId: tx.categoryId,
        note: tx.note,
        date: tx.date,
        userId,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    const categoryName = categories.find((c) => c.id === tx.categoryId)?.name;
    const accountName = accounts.find((a) => a.id === tx.accountId)?.name;
    await (0, telegram_1.editMessageText)(botToken, chatId, messageId, `✅ <b>Успешно добавлено!</b>\n\n💵 Сумма: ${tx.amount.toLocaleString()} ${tx.currency}\n📂 Категория: ${categoryName}\n💳 Счет: ${accountName}\n📝 Описание: ${tx.note || "—"}`);
    // Clean up pending transaction
    await pendingRef.delete();
}
// Cloud Function 2: Generate custom auth token for Telegram WebApp users
exports.authTelegram = (0, https_1.onCall)({ secrets: [TELEGRAM_BOT_TOKEN] }, async (request) => {
    const botToken = TELEGRAM_BOT_TOKEN.value();
    const { initData, timezoneOffset } = request.data;
    if (!initData) {
        throw new https_1.HttpsError("invalid-argument", "Missing Telegram initData.");
    }
    const { isValid, user } = (0, telegram_1.verifyTelegramInitData)(initData, botToken);
    if (!isValid || !user || !user.id) {
        throw new https_1.HttpsError("unauthenticated", "Invalid Telegram signature or expired session.");
    }
    const telegramId = String(user.id);
    const firebaseUid = `telegram:${telegramId}`;
    try {
        // 1. Check if user already linked
        const userLinkSnap = await db.collection("telegramUsers").doc(telegramId).get();
        let userId = "";
        if (userLinkSnap.exists) {
            userId = userLinkSnap.data()?.userId;
            if (timezoneOffset !== undefined) {
                await db.collection("telegramUsers").doc(telegramId).update({ timezoneOffset });
            }
        }
        else {
            // Create new account and link
            // Create Firebase Auth user
            let authUser;
            try {
                authUser = await admin.auth().getUser(firebaseUid);
            }
            catch (e) {
                const error = e;
                if (error.code === "auth/user-not-found") {
                    const displayName = user.first_name + (user.last_name ? ` ${user.last_name}` : "");
                    authUser = await admin.auth().createUser({
                        uid: firebaseUid,
                        displayName: displayName,
                    });
                }
                else {
                    throw e;
                }
            }
            userId = authUser.uid;
            // Save in links collection
            await db.collection("telegramUsers").doc(telegramId).set({
                userId: userId,
                telegramId: telegramId,
                timezoneOffset: timezoneOffset !== undefined ? timezoneOffset : -300, // Default to UZS timezone offset
                createdAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        // 2. Generate custom token for the actual user account
        const customToken = await admin.auth().createCustomToken(userId);
        return { customToken };
    }
    catch (e) {
        console.error("Auth Telegram Error:", e);
        const error = e;
        throw new https_1.HttpsError("internal", error.message || "Failed to authenticate.");
    }
});
/**
 * Splits a text into chunks of at most maxLength characters, splitting at line boundaries if possible.
 */
function splitMessage(text, maxLength = 4000) {
    const chunks = [];
    let currentChunk = "";
    const lines = text.split("\n");
    for (const line of lines) {
        if (line.length > maxLength) {
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
                currentChunk = "";
            }
            let remaining = line;
            while (remaining.length > maxLength) {
                chunks.push(remaining.substring(0, maxLength));
                remaining = remaining.substring(maxLength);
            }
            currentChunk = remaining + "\n";
        }
        else if ((currentChunk + line).length > maxLength) {
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
            }
            currentChunk = line + "\n";
        }
        else {
            currentChunk += line + "\n";
        }
    }
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}
//# sourceMappingURL=index.js.map