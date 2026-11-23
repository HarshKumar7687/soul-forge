import { Schema, model, type InferSchemaType } from "mongoose";

export const GENRES = ["fantasy", "mystery", "romance", "sci-fi", "thriller", "adventure", "other"] as const;

const str = (max: number) => ({ type: String, trim: true, maxlength: max, default: "" });

const stateSchema = new Schema(
  {
    currentScene: str(1000),
    participants: { type: [{ type: String, maxlength: 60 }], default: [] },
    events: { type: [{ type: String, maxlength: 300 }], default: [] },
    threads: {
      type: [new Schema({ text: { type: String, maxlength: 300 }, resolved: { type: Boolean, default: false } }, { _id: false })],
      default: [],
    },
    relationships: {
      type: [new Schema({ a: { type: String, maxlength: 60 }, b: { type: String, maxlength: 60 }, note: { type: String, maxlength: 300 } }, { _id: false })],
      default: [],
    },
  },
  { _id: false }
);

const storySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    genre: { type: String, enum: GENRES, default: "adventure" },
    contentRating: { type: String, enum: ["general", "mature"], default: "general" },
    setting: str(1500),
    initialSituation: str(1500),
    characterIds: { type: [Schema.Types.ObjectId], default: [] },
    state: { type: stateSchema, default: () => ({}) },
    sceneCount: { type: Number, default: 0 },
    lastActivityAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        ret.userId = String(ret.userId);
        ret.characterIds = (ret.characterIds as unknown[]).map(String);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

storySchema.index({ userId: 1, lastActivityAt: -1 });

export type StoryDoc = InferSchemaType<typeof storySchema>;
export const Story = model("Story", storySchema);
