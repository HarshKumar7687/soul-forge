import { Schema, model } from "mongoose";

export const REPORT_REASONS = ["inappropriate", "harassment", "copyright", "other"] as const;
/** Public characters with this many reports are hidden from discovery until reviewed. */
export const REPORT_HIDE_THRESHOLD = 5;

const reportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    characterId: { type: Schema.Types.ObjectId, ref: "Character", required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, trim: true, maxlength: 500, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

reportSchema.index({ reporterId: 1, characterId: 1 }, { unique: true });
reportSchema.index({ characterId: 1 });

export const Report = model("Report", reportSchema);
