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
};
