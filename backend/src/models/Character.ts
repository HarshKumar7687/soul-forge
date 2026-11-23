import { Schema, model, type InferSchemaType } from "mongoose";
import { CATEGORIES } from "../validators/constants";

const dialogueSchema = new Schema(
  {
    user: { type: String, trim: true, maxlength: 500, default: "" },
    character: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { _id: false }
);

const str = (max: number) => ({ type: String, trim: true, maxlength: max, default: "" });

const characterSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 60 },
    age: { type: Number, min: 0, max: 100000 },
    gender: str(40),
    category: { type: String, enum: CATEGORIES, default: "other" },
    contentRating: { type: String, enum: ["general", "mature"], default: "general" },
    shortDescription: str(200),
    appearance: str(1500),
    personalityTraits: { type: [{ type: String, trim: true, maxlength: 30 }], default: [] },
    backstory: str(4000),
    speakingStyle: str(1000),
    interests: str(800),
    dislikes: str(800),
    goals: str(1000),
    relationshipWithUser: str(600),
    scenario: str(1500),
    greeting: str(1000),
    exampleDialogues: { type: [dialogueSchema], default: [] },
    visibility: { type: String, enum: ["private", "public"], default: "private" },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    portraitUrl: str(300),
    // Used for sorting in later phases
    chatCount: { type: Number, default: 0 },
    favoriteCount: { type: Number, default: 0 },
    reportCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        ret.ownerId = String(ret.ownerId);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

characterSchema.index({ ownerId: 1, updatedAt: -1 });
characterSchema.index({ status: 1, visibility: 1, createdAt: -1 });
characterSchema.index({ status: 1, visibility: 1, favoriteCount: -1 });
characterSchema.index({ name: "text", shortDescription: "text" });

export type CharacterDoc = InferSchemaType<typeof characterSchema>;
export const Character = model("Character", characterSchema);
