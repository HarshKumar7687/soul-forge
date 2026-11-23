import { Schema, model, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    bio: { type: String, trim: true, maxlength: 280, default: "" },
    // Unset means "use the server default (CHAT_REPLY_LENGTH)"
    replyLength: { type: String, enum: ["short", "medium", "long"] },
    avatarUrl: { type: String, default: "" },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
