import { Schema, model, type InferSchemaType } from "mongoose";

const conversationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    characterId: { type: Schema.Types.ObjectId, ref: "Character", required: true },
    title: { type: String, trim: true, maxlength: 120, default: "" },
    lastMessagePreview: { type: String, maxlength: 200, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
    messageCount: { type: Number, default: 0 },
    // Rolling summary of older messages, and the last message it covers
    summary: { type: String, maxlength: 6000, default: "" },
    summarizedThrough: { type: Date },
    // Messages up to this time were already checked for memories
    memoryCursor: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        ret.userId = String(ret.userId);
        ret.characterId = String(ret.characterId);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

conversationSchema.index({ userId: 1, lastMessageAt: -1 });
conversationSchema.index({ characterId: 1 });

export type ConversationDoc = InferSchemaType<typeof conversationSchema>;
export const Conversation = model("Conversation", conversationSchema);
