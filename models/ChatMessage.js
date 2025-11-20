import mongoose from "mongoose";

const chatMessageSchema = new mongoose.Schema(
  {
    session_id: { type: String, required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  },
  { collection: "chat_messages" }
);

export default mongoose.model("ChatMessage", chatMessageSchema);
