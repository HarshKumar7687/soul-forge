import { Schema, model, type InferSchemaType } from "mongoose";

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    // "greeting" is the character's authored opening line, "reply" is model output
    kind: { type: String, enum: ["greeting", "message", "reply"], default: "message" },
    content: { type: String, required: true, maxlength: 8000 },
    model: { type: String, maxlength: 200 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        ret.conversationId = String(ret.conversationId);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

messageSchema.index({ conversationId: 1, createdAt: 1, _id: 1 });

export type MessageDoc = InferSchemaType<typeof messageSchema>;
export const Message = model("Message", messageSchema);
