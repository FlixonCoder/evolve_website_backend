// server.js
import express from "express";
import 'dotenv/config'
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";       // ← NEW SDK
import { instructions } from "./Data/instructions.js";
import cors from "cors";



// -------------------------------------------------------------------
// DB setup
// -------------------------------------------------------------------
import mongoose from "mongoose";
import ChatMessage from "./models/ChatMessage.js";

// -------------------------------------------------------------
// MongoDB Connection
// -------------------------------------------------------------
mongoose
  .connect(process.env.MONGODB_URL, {
    dbName: "evolve_ai",
  })
  .then(() => console.log("🍃 MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));


// -------------------------------------------------------------------
// Path setup
// -------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, "Data");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

// -------------------------------------------------------------------
// Gemini Client (LATEST SDK style)
// -------------------------------------------------------------------
const api_key = process.env.GEMINI_API_KEY;

if (!api_key) {
  console.error("❌ GEMINI_API_KEY is missing. Make sure it's defined in your .env file.");
  process.exit(1); // Exit the server with failure status
}
const ai = new GoogleGenAI({
  apiKey: api_key,
});

// Max history lines to send to model
const MAX_HISTORY = 20;

// Express init
const app = express();
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Serve static files same as FastAPI did
app.use("/static", express.static(BASE_DIR));

// Serve index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(BASE_DIR, "index.html"));
});

// -------------------------------------------------------------------
// File-Based Session Memory
// -------------------------------------------------------------------
function safePath(sessionId) {
  const safe = sessionId.replace(/[^a-zA-Z0-9-_]/g, "");
  return path.join(DATA_DIR, `${safe}.json`);
}

function readHistory(sessionId) {
  const file = safePath(sessionId);
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

async function saveMessage(sessionId, role, content) {
  try {
    const msg = new ChatMessage({
      session_id: sessionId,
      role,
      content,
    });
    await msg.save();
  } catch (error) {
    console.error("Error saving message:", error);
  }
}

async function getHistory(sessionId, limit = 20) {
  return await ChatMessage
    .find({ session_id: sessionId })
    .sort({ timestamp: 1 })
    .limit(limit)
    .lean();
}


// -------------------------------------------------------------------
// POST /api/chat — Main LLM Endpoint
// -------------------------------------------------------------------
app.post("/api/chat", async (req, res) => {
  try {
    const { session_id, message } = req.body;

    if (!session_id || !message?.trim()) {
      return res.status(400).json({ detail: "Message cannot be empty." });
    }

    // Save user message
    await saveMessage(session_id, "user", message.trim());

    // Get latest history
    const history = await getHistory(session_id, MAX_HISTORY);

    // Convert to Gemini format
    const contents = history.map(m => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

    // Generate response
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents,
      config: {
        systemInstruction: instructions,
      },
    });

    // NEW RESPONSE FORMAT
    const reply = response.text.trim();


    // Save assistant message
    await saveMessage(session_id, "assistant", reply);

    res.json({ reply });

  } catch (err) {
    console.error("Gemini error:", err);
    res.status(500).json({ detail: "Error while generating response." });
  }
});


// -------------------------------------------------------------------
// GET /api/history/:session_id
// -------------------------------------------------------------------
app.get("/api/history/:session_id", async (req, res) => {
  const sessionId = req.params.session_id;
  const history = await ChatMessage.find({ session_id: sessionId }).sort({ timestamp: 1 });

  res.json({
    session_id: sessionId,
    messages: history,
  });
});

// -------------------------------------------------------------------
// Start server
// -------------------------------------------------------------------
const PORT = process.env.PORT || 8000;
app.listen(PORT, () =>
  console.log(`🚀 Node.js Gemini server running at http://localhost:${PORT}`)
);
