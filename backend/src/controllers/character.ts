import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { Character } from "../models/Character";
import { Favorite } from "../models/Favorite";
import { Report, REPORT_HIDE_THRESHOLD } from "../models/Report";
import { User } from "../models/User";
import { deleteCharacterDependents } from "../services/accountCleanup";
import { buildPortraitPrompt, getImageProvider } from "../services/ai/image";
import { deleteUploadIfUnused, saveImage } from "../services/uploads";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";
import { isAdult } from "../utils/content";
import { escapeRegex, isPublicVisible, publicCard } from "../utils/serializers";
import { publishErrors } from "../validators/character";

function assertPublishable(data: Parameters<typeof publishErrors>[0]) {
  const errs = publishErrors(data);
  if (Object.keys(errs).length) throw AppError.badRequest("This character is not ready to publish", errs);
}

/** 18+ rules: allowed by the server, adult age, never public. `requested` is what the request is changing. */
function assertRating(data: { contentRating?: string; age?: number | null; visibility?: string }, requested: { contentRating?: string }) {
  if (data.contentRating !== "mature") return;
  const errs: Record<string, string> = {};
  if (requested.contentRating === "mature" && !env.ALLOW_MATURE_CONTENT) {
    errs.contentRating = "Mature (18+) content is turned off on this server. Set ALLOW_MATURE_CONTENT=true in backend/.env to allow it.";
  }
  if (!isAdult(data.age)) errs.age = "18+ characters need an age of 18 or older";
  if (data.visibility === "public") errs.visibility = "18+ characters stay private";
  if (Object.keys(errs).length) throw AppError.badRequest("This character cannot be rated 18+ yet", errs);
}

function idParam(req: Request): string {
  const id = req.params.id;
  if (!isValidObjectId(id)) throw AppError.notFound("Character not found");
  return id;
}

/** Owner's character, or 404 (never reveals that someone else's exists). */
async function ownedOrThrow(req: Request) {
  const c = await Character.findOne({ _id: idParam(req), ownerId: req.userId });
  if (!c) throw AppError.notFound("Character not found");
  return c;
}

export async function create(req: Request, res: Response) {
  assertPublishable(req.body);
  assertRating(req.body, req.body);
  const c = await Character.create({ ...req.body, ownerId: req.userId });
  res.status(201).json({ character: c });
}

export async function listMine(req: Request, res: Response) {
  const characters = await Character.find({ ownerId: req.userId }).sort({ updatedAt: -1 }).limit(200);
  res.json({ characters });
}

export async function getOne(req: Request, res: Response) {
  const c = await Character.findById(idParam(req));
  const isOwner = !!c && !!req.userId && String(c.ownerId) === req.userId;
  if (!c || !(isOwner || isPublicVisible(c))) throw AppError.notFound("Character not found");
  const [owner, fav] = await Promise.all([
    User.findById(c.ownerId).select("displayName"),
    req.userId ? Favorite.exists({ userId: req.userId, characterId: c._id }) : null,
  ]);
  res.json({
    character: isOwner ? c : publicCard(c),
    creator: owner ? { id: String(owner._id), displayName: owner.displayName } : null,
    isFavorite: !!fav,
    isOwner,
  });
}

export async function update(req: Request, res: Response) {
  const c = await ownedOrThrow(req);
  const oldPortrait = c.portraitUrl;
  c.set(req.body);
  assertPublishable(c.toObject() as Parameters<typeof publishErrors>[0]);
  assertRating(c.toObject(), req.body);
  await c.save();
  if (oldPortrait !== c.portraitUrl) await deleteUploadIfUnused(oldPortrait);
  res.json({ character: c });
}

export async function remove(req: Request, res: Response) {
  const c = await ownedOrThrow(req);
  await deleteCharacterDependents([c._id]);
  await c.deleteOne();
  await deleteUploadIfUnused(c.portraitUrl);
  res.status(204).end();
}

export async function duplicate(req: Request, res: Response) {
  const src = await ownedOrThrow(req);
  const data = src.toObject();
  const copy = await Character.create({
    ...data,
    _id: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    name: `${data.name} (copy)`.slice(0, 60),
    status: "draft",
    visibility: "private",
    chatCount: 0,
    favoriteCount: 0,
  });
  res.status(201).json({ character: copy });
}

/** Public, published characters for the landing page. Full discovery arrives in Phase 6. */
export async function featured(_req: Request, res: Response) {
  const characters = await Character.find({ status: "published", visibility: "public", reportCount: { $lt: REPORT_HIDE_THRESHOLD }, contentRating: { $ne: "mature" } })
    .sort({ favoriteCount: -1, chatCount: -1, createdAt: -1 })
    .limit(6);
  res.json({ characters: characters.map(publicCard) });
}

export async function uploadPortrait(req: Request, res: Response) {
  if (!req.file) throw AppError.badRequest("Choose an image to upload");
  res.status(201).json({ url: await saveImage(req.file.buffer) });
}

/** Public discovery: search, filter, sort, paginate. Only published public characters, minus heavily reported ones. */
export async function browse(req: Request, res: Response) {
  const { q, category, trait, sort, page, limit } = res.locals.query as {
    q: string; category: string; trait: string; sort: "popular" | "recent"; page: number; limit: number;
  };
  const filter: Record<string, unknown> = { status: "published", visibility: "public", reportCount: { $lt: REPORT_HIDE_THRESHOLD }, contentRating: { $ne: "mature" } };
  if (q) { const rx = new RegExp(escapeRegex(q), "i"); filter.$or = [{ name: rx }, { shortDescription: rx }]; }
  if (category) filter.category = category;
  if (trait) filter.personalityTraits = { $regex: `^${escapeRegex(trait)}$`, $options: "i" };
  const order: Record<string, 1 | -1> = sort === "recent" ? { createdAt: -1, _id: -1 } : { favoriteCount: -1, chatCount: -1, createdAt: -1, _id: -1 };

  const [total, chars] = await Promise.all([
    Character.countDocuments(filter),
    Character.find(filter).sort(order).skip((page - 1) * limit).limit(limit),
  ]);
  const [owners, favs] = await Promise.all([
    User.find({ _id: { $in: [...new Set(chars.map((c) => String(c.ownerId)))] } }).select("displayName"),
    req.userId ? Favorite.find({ userId: req.userId, characterId: { $in: chars.map((c) => c._id) } }).select("characterId") : [],
  ]);
  const ownerName = new Map(owners.map((o) => [String(o._id), o.displayName]));
  const favSet = new Set(favs.map((f) => String(f.characterId)));
  res.json({
    characters: chars.map((c) => ({
      ...publicCard(c),
      creator: { id: String(c.ownerId), displayName: ownerName.get(String(c.ownerId)) ?? "Unknown" },
      isFavorite: favSet.has(String(c._id)),
    })),
    total, page, hasMore: page * limit < total,
  });
}

export async function traits(_req: Request, res: Response) {
  const rows = await Character.aggregate<{ _id: string; count: number }>([
    { $match: { status: "published", visibility: "public", reportCount: { $lt: REPORT_HIDE_THRESHOLD }, contentRating: { $ne: "mature" } } },
    { $unwind: "$personalityTraits" },
    { $group: { _id: { $toLower: "$personalityTraits" }, count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 20 },
  ]);
  res.json({ traits: rows.map((r) => ({ trait: r._id, count: r.count })) });
}

export async function report(req: Request, res: Response) {
  const c = await Character.findById(idParam(req));
  if (!c || !isPublicVisible(c)) throw AppError.notFound("Character not found");
  if (String(c.ownerId) === req.userId) throw AppError.badRequest("You cannot report your own character");
  try {
    await Report.create({ reporterId: req.userId, characterId: c._id, ...req.body });
  } catch (e) {
    if ((e as { code?: number }).code === 11000) throw AppError.conflict("You already reported this character");
    throw e;
  }
  await Character.updateOne({ _id: c._id }, { $inc: { reportCount: 1 } });
  res.status(201).json({ reported: true });
}

export async function generatePortrait(req: Request, res: Response) {
  const b = req.body as { appearance?: string; shortDescription?: string; extra?: string };
  if (![b.appearance, b.shortDescription, b.extra].some((x) => x?.trim())) {
    throw AppError.badRequest("Describe the character's appearance first, or add a short description.");
  }
  const provider = getImageProvider(); // clear configuration error when keys are missing
  const abort = new AbortController();
  res.on("close", () => { if (!res.writableEnded) abort.abort(); });
  const bytes = await provider.generate(buildPortraitPrompt(req.body), abort.signal);
  if (bytes.length > 10 * 1024 * 1024) throw AppError.badRequest("The generated image was too large. Try again.");
  res.status(201).json({ url: await saveImage(bytes), provider: provider.name });
}
