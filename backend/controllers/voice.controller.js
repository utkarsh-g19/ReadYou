const elevenLabsService = require("../services/elevenlabs.service");

function createAbortController(res) {
  const controller = new AbortController();
  const abortIfDisconnected = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on("close", abortIfDisconnected);
  return {
    signal: controller.signal,
    cleanup: () => res.off("close", abortIfDisconnected),
  };
}

function serviceError(res, error, fallback) {
  if (res.destroyed) return;
  const missingKey = error.message === "ELEVENLABS_API_KEY is not configured.";
  const inputError = /required|too large|between 1 and|empty speech/i.test(error.message);
  return res.status(missingKey ? 503 : inputError ? 400 : 502).json({
    error: missingKey ? "Voice features need an ElevenLabs API key on the backend." : inputError ? error.message : fallback,
  });
}

function plainSpeechText(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[*_`~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function transcribe(req, res) {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: "Record a short question first." });
  }
  const contentType = req.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("audio/")) {
    return res.status(415).json({ error: "Send a supported audio recording." });
  }

  const abort = createAbortController(res);
  try {
    const question = await elevenLabsService.transcribeVoiceQuestion(
      req.body,
      contentType,
      abort.signal,
    );
    if (!res.destroyed) return res.json({ question });
  } catch (error) {
    if (error.name !== "AbortError") {
      return serviceError(res, error, "Speech recognition failed. Try typing your question instead.");
    }
  } finally {
    abort.cleanup();
  }
}

async function speak(req, res) {
  const text = plainSpeechText(req.body?.text);
  if (!text || text.length > 1600) {
    return res.status(400).json({ error: "Spoken answers must contain between 1 and 1,600 characters." });
  }

  const abort = createAbortController(res);
  try {
    const audio = await elevenLabsService.generateConversationalSpeech(text, abort.signal);
    if (res.destroyed) return;
    res.set({
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "Content-Length": String(audio.length),
    });
    return res.send(audio);
  } catch (error) {
    if (error.name !== "AbortError") {
      return serviceError(res, error, "Speech generation failed. Try again or keep reading the answer.");
    }
  } finally {
    abort.cleanup();
  }
}

module.exports = { transcribe, speak, plainSpeechText };
