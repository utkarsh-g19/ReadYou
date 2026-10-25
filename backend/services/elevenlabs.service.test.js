const test = require("node:test");
const assert = require("node:assert/strict");
const elevenLabsService = require("./elevenlabs.service");

test("transcribes a browser voice recording through ElevenLabs Scribe without caching it", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = "test-key";
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return Response.json({ text: "How does this project work?" });
  };
  try {
    const transcript = await elevenLabsService.transcribeVoiceQuestion(
      Buffer.from("audio bytes"),
      "audio/webm;codecs=opus",
    );
    assert.equal(transcript, "How does this project work?");
    assert.equal(request.url, "https://api.elevenlabs.io/v1/speech-to-text");
    assert.equal(request.options.headers["xi-api-key"], "test-key");
    assert.equal(request.options.body.get("model_id"), "scribe_v2");
    assert.equal(request.options.body.get("no_verbatim"), "true");
    assert.match(request.options.body.get("file").type, /^audio\/webm$/);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalKey;
  }
});

test("generates uncached short-form speech with the configured ElevenLabs voice", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.ELEVENLABS_API_KEY;
  const originalVoice = process.env.ELEVENLABS_VOICE_ID;
  process.env.ELEVENLABS_API_KEY = "test-key";
  process.env.ELEVENLABS_VOICE_ID = "read-you-voice";
  let request;
  global.fetch = async (url, options) => {
    request = { url: String(url), options };
    return new Response(Buffer.from("mp3 bytes"), { headers: { "content-type": "audio/mpeg" } });
  };
  try {
    const audio = await elevenLabsService.generateConversationalSpeech("A concise spoken answer.");
    assert.equal(audio.toString(), "mp3 bytes");
    assert.match(request.url, /text-to-speech\/read-you-voice/);
    assert.equal(request.options.headers["xi-api-key"], "test-key");
    const body = JSON.parse(request.options.body);
    assert.equal(body.text, "A concise spoken answer.");
    assert.equal(body.model_id, "eleven_flash_v2_5");
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalKey;
    if (originalVoice === undefined) delete process.env.ELEVENLABS_VOICE_ID;
    else process.env.ELEVENLABS_VOICE_ID = originalVoice;
  }
});
