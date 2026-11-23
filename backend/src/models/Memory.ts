import { Schema, model, type InferSchemaType } from "mongoose";

export const MEMORY_TYPES = ["fact", "event", "relationship", "story", "preference"] as const;

const memorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    characterId: { type: Schema.Types.ObjectId, ref: "Character", required: true },
    content: { type: String, required: true, trim: true, minlength: 3, maxlength: 400 },
    type: { type: String, enum: MEMORY_TYPES, default: "fact" },
    source: { type: String, enum: ["auto", "manual"], default: "manual" },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation" },
    embedding: { type: [Number], select: false },
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
        delete ret.embedding;
        return ret;
      },
    },
  }
);

memorySchema.index({ userId: 1, characterId: 1, updatedAt: -1 });

export type MemoryDoc = InferSchemaType<typeof memorySchema>;
export const Memory = model("Memory", memorySchema);
