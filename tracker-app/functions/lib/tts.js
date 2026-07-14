"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGoogleAccessToken = getGoogleAccessToken;
exports.synthesizeSpeech = synthesizeSpeech;
exports.cleanMarkdownForTTS = cleanMarkdownForTTS;
const axios_1 = __importDefault(require("axios"));
/**
 * Retrieves the service account access token from the Google Metadata server.
 * This works automatically in Google Cloud Functions environment.
 */
async function getGoogleAccessToken() {
    try {
        const res = await axios_1.default.get("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
            headers: { "Metadata-Flavor": "Google" },
        });
        return res.data?.access_token || null;
    }
    catch (e) {
        const error = e;
        console.error("Error fetching access token from metadata server:", error.message);
        return null;
    }
}
/**
 * Synthesizes speech from text using Google Cloud Text-to-Speech API.
 * Returns the synthesized OGG_OPUS audio content as a Buffer.
 */
async function synthesizeSpeech(text, accessToken) {
    const url = "https://texttospeech.googleapis.com/v1/text:synthesize";
    const requestBody = {
        input: { text },
        voice: {
            languageCode: "ru-RU",
            name: "ru-RU-Wavenet-C",
            ssmlGender: "FEMALE",
        },
        audioConfig: {
            audioEncoding: "OGG_OPUS",
        },
    };
    try {
        const res = await axios_1.default.post(url, requestBody, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });
        const audioContent = res.data?.audioContent;
        if (audioContent) {
            return Buffer.from(audioContent, "base64");
        }
        return null;
    }
    catch (e) {
        const error = e;
        console.error("Error in Cloud TTS synthesis:", error.response?.data || error.message);
        return null;
    }
}
/**
 * Strips markdown symbols, HTML tags, and emojis from the text,
 * preparing it to be synthesized by the TTS API without spelling formatting chars.
 */
function cleanMarkdownForTTS(text) {
    return text
        // Remove Markdown formatting: *, _, `, #, ~, |
        .replace(/[*_`#~|]/g, "")
        // Remove HTML tags (like <b>, <i>, etc.)
        .replace(/<[^>]*>/g, "")
        // Remove Emojis
        .replace(/[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, "")
        // Normalize spaces and trim
        .replace(/\s+/g, " ")
        .trim();
}
//# sourceMappingURL=tts.js.map