import { Schema, model } from "mongoose";

const sceneSchema = new Schema(
  {
    storyId: { type: Schema.Types.ObjectId, ref: "Story", required: true },
    index: { type: Number, required: true, min: 0 },
    userInput: { type: String, maxlength: 2000, default: "" },
    narration: { type: String, required: true, maxlength: 12000 },
    choices: { type: [{ type: String, maxlength: 200 }], default: [] },
    stateUpdated: { type: Boolean, default: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        ret.storyId = String(ret.storyId);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

sceneSchema.index({ storyId: 1, index: 1 }, { unique: true });

export const StoryScene = model("StoryScene", sceneSchema);
