import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { Character } from "../models/Character";
import { Favorite } from "../models/Favorite";
import { AppError } from "../utils/AppError";
import { isPublicVisible, publicCard } from "../utils/serializers";

export async function add(req: Request, res: Response) {
  const c = await Character.findById(req.body.characterId);
  if (!c || (String(c.ownerId) !== req.userId && !isPublicVisible(c))) throw AppError.notFound("Character not found");
  try {
    await Favorite.create({ userId: req.userId, characterId: c._id });
    await Character.updateOne({ _id: c._id }, { $inc: { favoriteCount: 1 } });
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e; // already a favorite: idempotent
  }
  res.status(201).json({ favorited: true });
}

export async function remove(req: Request, res: Response) {
  if (!isValidObjectId(req.params.characterId)) throw AppError.notFound("Character not found");
  const r = await Favorite.deleteOne({ userId: req.userId, characterId: req.params.characterId });
  if (r.deletedCount) await Character.updateOne({ _id: req.params.characterId, favoriteCount: { $gt: 0 } }, { $inc: { favoriteCount: -1 } });
  res.status(204).end();
}

export async function list(req: Request, res: Response) {
  const favs = await Favorite.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(200);
  const chars = await Character.find({ _id: { $in: favs.map((f) => f.characterId) } });
  const byId = new Map(chars.map((c) => [String(c._id), c]));
  // Hide characters that are no longer visible to this user (made private, reported, ...).
  const visible = favs.map((f) => byId.get(String(f.characterId))).filter((c): c is NonNullable<typeof c> => !!c && (String(c.ownerId) === req.userId || isPublicVisible(c)));
  res.json({ characters: visible.map((c) => ({ ...publicCard(c), isFavorite: true })) });
}
