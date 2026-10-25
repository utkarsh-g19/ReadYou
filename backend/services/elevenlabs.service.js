const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const AUDIO_DIR = path.resolve(__dirname, "../../reports/audio");
const inFlight = new Map();

function getCacheKey(submissionUrl) {
  return crypto.createHash("sha256").update(submissionUrl).digest("hex");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function generateOrGetAudio(submissionUrl, text) {
  const audioText = String(text || "").trim();

  if (!audioText) {
    throw new Error("Audio introduction is empty.");
  }

  const cacheKey = getCacheKey(submissionUrl);
  const filePath = path.join(AUDIO_DIR, `${cacheKey}.mp3`);

  // Reuse previously generated audio without spending more credits.
  if (await fileExists(filePath)) {
    return { cacheKey, cached: true };
  }

  // Avoid duplicate API calls for the same project.
  if (inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey);
  }

  const request = (async () => {
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      throw new Error(
        "ELEVENLABS_API_KEY is missing from your backend .env file.",
      );
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";

    const modelId = process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2";

    const endpoint = new URL(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    );

    endpoint.searchParams.set("output_format", "mp3_44100_128");

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: audioText,
        model_id: modelId,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          style: 0.25,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const details = await response.text();

      throw new Error(
        `ElevenLabs request failed (${response.status}): ${details.slice(0, 300)}`,
      );
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    if (audioBuffer.length === 0) {
      throw new Error("ElevenLabs returned an empty audio file.");
    }

    await fs.mkdir(AUDIO_DIR, { recursive: true });

    const temporaryPath = `${filePath}.${process.pid}.tmp`;

    await fs.writeFile(temporaryPath, audioBuffer);
    await fs.rename(temporaryPath, filePath);

    console.log(
      `[ReadYou audio] Generated and cached audio for ${submissionUrl}`,
    );

    return { cacheKey, cached: false };
  })();

  inFlight.set(cacheKey, request);

  try {
    return await request;
  } finally {
    inFlight.delete(cacheKey);
  }
}

async function transcribeVoiceQuestion(audioBuffer, mimeType = "audio/webm", signal) {
  if (!Buffer.isBuffer(audioBuffer) || audioBuffer.length === 0) {
    throw new Error("A voice recording is required.");
  }
  if (audioBuffer.length > 8 * 1024 * 1024) {
    throw new Error("The recording is too large. Try a shorter question.");
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");

  const safeMimeType = /^audio\/[a-z0-9.+-]+(?:\s*;.*)?$/i.test(mimeType)
    ? mimeType.split(";")[0].trim().toLowerCase()
    : "audio/webm";
  const extension = safeMimeType.split("/")[1].replace(/[^a-z0-9]/g, "") || "webm";
  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: safeMimeType }), `question.${extension}`);
  form.append("model_id", process.env.ELEVENLABS_STT_MODEL || "scribe_v2");
  form.append("no_verbatim", "true");
  form.append("tag_audio_events", "false");

  const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
    signal,
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs transcription failed (${response.status}).`);
  }

  const result = await response.json();
  const transcript = typeof result.text === "string" ? result.text.trim() : "";
  if (!transcript) throw new Error("I couldn't hear a question in that recording. Try again or type it instead.");
  return transcript;
}

async function generateConversationalSpeech(text, signal) {
  const speechText = String(text || "").trim();
  if (!speechText || speechText.length > 1600) {
    throw new Error("Spoken answers must contain between 1 and 1,600 characters.");
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not configured.");

  const voiceId = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
  const endpoint = new URL(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`);
  endpoint.searchParams.set("output_format", "mp3_44100_128");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: speechText,
      model_id: process.env.ELEVENLABS_CHAT_MODEL || "eleven_flash_v2_5",
      voice_settings: {
        stability: 0.42,
        similarity_boost: 0.75,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs speech generation failed (${response.status}).`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new Error("ElevenLabs returned empty speech audio.");
  return audio;
}

async function getCachedAudioPath(cacheKey) {
  if (!/^[a-f0-9]{64}$/.test(cacheKey)) {
    return null;
  }

  const filePath = path.join(AUDIO_DIR, `${cacheKey}.mp3`);

  return (await fileExists(filePath)) ? filePath : null;
}

module.exports = {
  generateOrGetAudio,
  getCachedAudioPath,
  transcribeVoiceQuestion,
  generateConversationalSpeech,
};
