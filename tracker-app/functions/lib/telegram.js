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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTelegramMessage = sendTelegramMessage;
exports.answerCallbackQuery = answerCallbackQuery;
exports.editMessageText = editMessageText;
exports.deleteTelegramMessage = deleteTelegramMessage;
exports.verifyTelegramInitData = verifyTelegramInitData;
exports.getTelegramFile = getTelegramFile;
exports.downloadTelegramFile = downloadTelegramFile;
exports.sendTelegramVoice = sendTelegramVoice;
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
/**
 * Sends a message to the specified Telegram chat.
 * Returns the Axios response data, which contains the sent message information.
 */
async function sendTelegramMessage(botToken, chatId, text, replyMarkup) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        const res = await axios_1.default.post(url, {
            chat_id: chatId,
            text: text,
            reply_markup: replyMarkup,
            parse_mode: "HTML",
        });
        return res.data;
    }
    catch (e) {
        const error = e;
        console.error("Error sending Telegram message:", error.response?.data || error.message);
        return null;
    }
}
/**
 * Answers a Telegram Callback Query to remove the loading state on the Telegram client.
 */
async function answerCallbackQuery(botToken, callbackQueryId, text) {
    const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
    try {
        await axios_1.default.post(url, {
            callback_query_id: callbackQueryId,
            text: text,
        });
    }
    catch (e) {
        const error = e;
        console.error("Error answering callback query:", error.response?.data || error.message);
    }
}
/**
 * Edits the text (and optionally the inline keyboard markup) of an existing Telegram message.
 */
async function editMessageText(botToken, chatId, messageId, text, replyMarkup) {
    const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
    try {
        await axios_1.default.post(url, {
            chat_id: chatId,
            message_id: messageId,
            text: text,
            reply_markup: replyMarkup,
            parse_mode: "HTML",
        });
        return true;
    }
    catch (e) {
        const error = e;
        console.error("Error editing Telegram message:", error.response?.data || error.message);
        return false;
    }
}
/**
 * Deletes a message from Telegram.
 */
async function deleteTelegramMessage(botToken, chatId, messageId) {
    const url = `https://api.telegram.org/bot${botToken}/deleteMessage`;
    try {
        await axios_1.default.post(url, {
            chat_id: chatId,
            message_id: messageId,
        });
    }
    catch (e) {
        const error = e;
        console.error("Error deleting Telegram message:", error.response?.data || error.message);
    }
}
/**
 * Verifies the initialization data received from the Telegram WebApp.
 */
function verifyTelegramInitData(initDataStr, botToken) {
    try {
        const params = new URLSearchParams(initDataStr);
        const hash = params.get("hash");
        if (!hash)
            return { isValid: false };
        params.delete("hash");
        const keys = Array.from(params.keys()).sort();
        const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join("\n");
        const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
        const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
        const isValid = computedHash === hash;
        const authDate = Number(params.get("auth_date") || 0);
        const now = Math.floor(Date.now() / 1000);
        const isNotExpired = now - authDate < 86400; // 24 hours
        if (isValid && isNotExpired) {
            const userStr = params.get("user");
            const user = userStr ? JSON.parse(userStr) : undefined;
            return { isValid: true, user };
        }
        return { isValid: false };
    }
    catch {
        return { isValid: false };
    }
}
/**
 * Retrieves the file path of a Telegram file using its file_id.
 */
async function getTelegramFile(botToken, fileId) {
    const url = `https://api.telegram.org/bot${botToken}/getFile`;
    try {
        const res = await axios_1.default.post(url, { file_id: fileId });
        if (res.data?.ok && res.data?.result?.file_path) {
            return res.data.result.file_path;
        }
        return null;
    }
    catch (e) {
        const error = e;
        console.error("Error getting Telegram file path:", error.response?.data || error.message);
        return null;
    }
}
/**
 * Downloads a Telegram file into a Buffer using its file path.
 */
async function downloadTelegramFile(botToken, filePath) {
    const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    try {
        const res = await axios_1.default.get(url, { responseType: "arraybuffer" });
        return Buffer.from(res.data);
    }
    catch (e) {
        const error = e;
        console.error("Error downloading Telegram file:", error.response?.data || error.message);
        return null;
    }
}
/**
 * Sends an audio voice note to a Telegram chat.
 */
async function sendTelegramVoice(botToken, chatId, voiceBuffer) {
    const url = `https://api.telegram.org/bot${botToken}/sendVoice`;
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    const blob = new Blob([new Uint8Array(voiceBuffer)], { type: "audio/ogg" });
    formData.append("voice", blob, "voice.ogg");
    try {
        const res = await axios_1.default.post(url, formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });
        return res.data;
    }
    catch (e) {
        const error = e;
        console.error("Error sending Telegram voice:", error.response?.data || error.message);
        return null;
    }
}
//# sourceMappingURL=telegram.js.map