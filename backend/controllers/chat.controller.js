const chatService = require("../services/chat.service");

const ALLOWED_FIELDS = new Set(["projectId", "question", "sessionId", "includeSources"]);

function validateChatPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "A JSON object is required.";
  }
  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) {
    return "Only projectId, question, sessionId, and includeSources are accepted.";
  }
  return null;
}

async function ask(req, res) {
  const invalid = validateChatPayload(req.body);
  if (invalid) return res.status(400).json({ error: invalid, code: "INVALID_REQUEST" });

  try {
    return res.json(await chatService.ask(req.body));
  } catch (error) {
    return res.status(error.status || 500).json({
      error: error.status ? error.message : "Chat could not be completed.",
      code: error.code || "CHAT_FAILED",
    });
  }
}

module.exports = { ask, validateChatPayload };
