import { Schema, model } from "mongoose";

const favoriteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    characterId: { type: Schema.Types.ObjectId, ref: "Character", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

favoriteSchema.index({ userId: 1, characterId: 1 }, { unique: true });
favoriteSchema.index({ userId: 1, createdAt: -1 });
favoriteSchema.index({ characterId: 1 });

export const Favorite = model("Favorite", favoriteSchema);
