import mongoose from "mongoose";

const chatSessionSchema = new mongoose.Schema(
    {
        session_id: { type: String, required: true, unique: true },
        messages: [
            {
                role: { type: String, enum: ["user", "assistant"], required: true },
                content: { type: String, required: true },
                timestamp: { type: Date, default: Date.now }
            }
        ]
    },
    { collection: "chat_sessions" }
);

export default mongoose.model("ChatSession", chatSessionSchema);
