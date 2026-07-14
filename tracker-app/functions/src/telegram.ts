import axios from "axios";
import * as crypto from "crypto";

/**
 * Sends a message to the specified Telegram chat.
 * Returns the Axios response data, which contains the sent message information.
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<unknown> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await axios.post(url, {
      chat_id: chatId,
      text: text,
      reply_markup: replyMarkup,
      parse_mode: "HTML",
    });
    return res.data;
  } catch (e: unknown) {
    const error = e as { response?: { data?: unknown }; message?: string };
    console.error("Error sending Telegram message:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Answers a Telegram Callback Query to remove the loading state on the Telegram client.
 */
export async function answerCallbackQuery(botToken: string, callbackQueryId: string, text?: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
  try {
    await axios.post(url, {
      callback_query_id: callbackQueryId,
      text: text,
    });
  } catch (e: unknown) {
    const error = e as { response?: { data?: unknown }; message?: string };
    console.error("Error answering callback query:", error.response?.data || error.message);
  }
}

/**
 * Edits the text (and optionally the inline keyboard markup) of an existing Telegram message.
 */
export async function editMessageText(
  botToken: string,
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: Record<string, unknown>
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
  try {
    await axios.post(url, {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      reply_markup: replyMarkup,
      parse_mode: "HTML",
    });
  } catch (e: unknown) {
    const error = e as { response?: { data?: unknown }; message?: string };
    console.error("Error editing Telegram message:", error.response?.data || error.message);
  }
}

/**
 * Deletes a message from Telegram.
 */
export async function deleteTelegramMessage(botToken: string, chatId: number, messageId: number): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/deleteMessage`;
  try {
    await axios.post(url, {
      chat_id: chatId,
      message_id: messageId,
    });
  } catch (e: unknown) {
    const error = e as { response?: { data?: unknown }; message?: string };
    console.error("Error deleting Telegram message:", error.response?.data || error.message);
  }
}

/**
 * Verifies the initialization data received from the Telegram WebApp.
 */
export function verifyTelegramInitData(initDataStr: string, botToken: string): { isValid: boolean; user?: Record<string, unknown> } {
  try {
    const params = new URLSearchParams(initDataStr);
    const hash = params.get("hash");
    if (!hash) return { isValid: false };

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
      const user = userStr ? JSON.parse(userStr) as Record<string, unknown> : undefined;
      return { isValid: true, user };
    }
    return { isValid: false };
  } catch {
    return { isValid: false };
  }
}

/**
 * Retrieves the file path of a Telegram file using its file_id.
 */
export async function getTelegramFile(botToken: string, fileId: string): Promise<string | null> {
  const url = `https://api.telegram.org/bot${botToken}/getFile`;
  try {
    const res = await axios.post(url, { file_id: fileId });
    if (res.data?.ok && res.data?.result?.file_path) {
      return res.data.result.file_path;
    }
    return null;
  } catch (e: unknown) {
    const error = e as { response?: { data?: unknown }; message?: string };
    console.error("Error getting Telegram file path:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Downloads a Telegram file into a Buffer using its file path.
 */
export async function downloadTelegramFile(botToken: string, filePath: string): Promise<Buffer | null> {
  const url = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer" });
    return Buffer.from(res.data as ArrayBuffer);
  } catch (e: unknown) {
    const error = e as { response?: { data?: unknown }; message?: string };
    console.error("Error downloading Telegram file:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Sends an audio voice note to a Telegram chat.
 */
export async function sendTelegramVoice(
  botToken: string,
  chatId: number,
  voiceBuffer: Buffer
): Promise<unknown> {
  const url = `https://api.telegram.org/bot${botToken}/sendVoice`;
  const formData = new FormData();
  formData.append("chat_id", String(chatId));

  const blob = new Blob([new Uint8Array(voiceBuffer)], { type: "audio/ogg" });
  formData.append("voice", blob, "voice.ogg");

  try {
    const res = await axios.post(url, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return res.data;
  } catch (e: unknown) {
    const error = e as { response?: { data?: unknown }; message?: string };
    console.error("Error sending Telegram voice:", error.response?.data || error.message);
    return null;
  }
}


