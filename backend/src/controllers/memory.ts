import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { Character } from "../models/Character";
import { Memory } from "../models/Memory";
import { getLLM, llmConfigured } from "../services/ai";
import { embedSafely } from "../services/memoryService";
import { AppError } from "../utils/AppError";
import { isPublicVisible } from "../utils/serializers";

function idOf(req: Request): string {
  if (!isValidObjectId(req.params.id)) throw AppError.notFound("Memory not found");
  return req.params.id;
}

export async function list(req: Request, res: Response) {
  const filter: Record<string, unknown> = { userId: req.userId };
  const cid = req.query.characterId;
  if (typeof cid === "string" && cid) {
    if (!isValidObjectId(cid)) throw AppError.badRequest("Invalid character");
    filter.characterId = cid;
  }
  const memories = await Memory.find(filter).sort({ updatedAt: -1 }).limit(500);
  const chars = await Character.find({ _id: { $in: [...new Set(memories.map((m) => String(m.characterId)))] } }).select("name portraitUrl");
  res.json({ memories, characters: chars.map((c) => ({ id: String(c._id), name: c.name, portraitUrl: c.portraitUrl })) });
}

export async function create(req: Request, res: Response) {
  const c = await Character.findById(req.body.characterId);
  if (!c || (String(c.ownerId) !== req.userId && !isPublicVisible(c))) throw AppError.notFound("Character not found");
  const embedding = llmConfigured() ? await embedSafely(getLLM(), req.body.content) : undefined;
  const m = await Memory.create({ ...req.body, userId: req.userId, source: "manual", ...(embedding ? { embedding } : {}) });
  res.status(201).json({ memory: m });
}

export async function update(req: Request, res: Response) {
  const m = await Memory.findOne({ _id: idOf(req), userId: req.userId });
  if (!m) throw AppError.notFound("Memory not found");
  if (req.body.type) m.type = req.body.type;
  if (req.body.content && req.body.content !== m.content) {
    m.content = req.body.content;
    // The old embedding no longer matches the text.
    m.set("embedding", llmConfigured() ? await embedSafely(getLLM(), m.content) : undefined);
  }
  await m.save();
  res.json({ memory: m });
}

export async function remove(req: Request, res: Response) {
  const r = await Memory.deleteOne({ _id: idOf(req), userId: req.userId });
  if (!r.deletedCount) throw AppError.notFound("Memory not found");
  res.status(204).end();
}
