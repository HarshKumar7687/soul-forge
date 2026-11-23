import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { Character } from "../models/Character";
import { Story } from "../models/Story";
import { StoryScene } from "../models/StoryScene";
import { User } from "../models/User";
import { getLLM, ProviderError } from "../services/ai";
import { deleteStoriesWhere } from "../services/accountCleanup";
import {
  applyStateUpdate, buildStoryMessages, consumeStoryStream, parseStateUpdate, type StoryState,
} from "../services/storyEngine";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { env } from "../config/env";
import { isAdult, isMatureActive } from "../utils/content";
import { isPublicVisible } from "../utils/serializers";

const generating = new Set<string>();
const sse = (res: Response, event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

async function owned(req: Request) {
  if (!isValidObjectId(req.params.id)) throw AppError.notFound("Story not found");
  const s = await Story.findOne({ _id: req.params.id, userId: req.userId });
  if (!s) throw AppError.notFound("Story not found");
  return s;
}

/** Characters the user may cast: their own, or public ones. */
async function castable(userId: string | undefined, ids: string[]) {
  const unique = [...new Set(ids)];
  const chars = await Character.find({ _id: { $in: unique } });
  const ok = chars.filter((c) => String(c.ownerId) === userId || isPublicVisible(c));
  if (ok.length !== unique.length) throw AppError.badRequest("One or more characters are not available");
  return ok;
}

/** Mature stories need the server switch on and an adult-only cast. */
function assertMatureStory(rating: string, requested: boolean, chars: { name: string; age?: number | null }[]) {
  if (rating !== "mature") return;
  if (requested && !env.ALLOW_MATURE_CONTENT) {
    throw AppError.badRequest("Mature (18+) content is turned off on this server. Set ALLOW_MATURE_CONTENT=true in backend/.env to allow it.", { contentRating: "Turned off on this server" });
  }
  const minors = chars.filter((c) => !isAdult(c.age)).map((c) => c.name);
  if (minors.length) throw AppError.badRequest(`18+ stories can only include characters aged 18 or older. Fix: ${minors.join(", ")}`, { characterIds: "Every character needs an age of 18 or older" });
}

const brief = (c: { _id: unknown; name: string; portraitUrl?: string; shortDescription?: string }) =>
  ({ id: String(c._id), name: c.name, portraitUrl: c.portraitUrl ?? "", shortDescription: c.shortDescription ?? "" });

export async function create(req: Request, res: Response) {
  const chars = await castable(req.userId, req.body.characterIds);
  assertMatureStory(req.body.contentRating, true, chars);
  const story = await Story.create({
    ...req.body,
    userId: req.userId,
    characterIds: chars.map((c) => c._id),
    state: { currentScene: req.body.initialSituation, participants: chars.map((c) => c.name), events: [], threads: [], relationships: [] },
  });
  res.status(201).json({ story });
}

export async function list(req: Request, res: Response) {
  const stories = await Story.find({ userId: req.userId }).sort({ lastActivityAt: -1 }).limit(100);
  res.json({ stories });
}

export async function get(req: Request, res: Response) {
  const story = await owned(req);
  const [scenes, chars] = await Promise.all([
    StoryScene.find({ storyId: story._id }).sort({ index: 1 }).limit(300),
    Character.find({ _id: { $in: story.characterIds } }).select("name portraitUrl shortDescription"),
  ]);
  res.json({ story, scenes, characters: chars.map(brief) });
}

export async function scenes(req: Request, res: Response) {
  const story = await owned(req);
  const before = Number.parseInt(String(req.query.before ?? ""), 10);
  const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? "50"), 10) || 50, 1), 100);
  const filter: Record<string, unknown> = { storyId: story._id };
  if (Number.isFinite(before)) filter.index = { $lt: before };
  const found = await StoryScene.find(filter).sort({ index: -1 }).limit(limit);
  const lowest = found.length ? found[found.length - 1].index : 0;
  res.json({ scenes: found.reverse(), hasMore: lowest > 0 });
}

export async function remove(req: Request, res: Response) {
  const story = await owned(req);
  await deleteStoriesWhere({ _id: story._id });
  res.status(204).end();
}

export async function addCharacter(req: Request, res: Response) {
  const story = await owned(req);
  const [char] = await castable(req.userId, [req.body.characterId]);
  assertMatureStory(story.contentRating, false, [char]);
  if (story.characterIds.some((id) => String(id) === String(char._id))) throw AppError.conflict("That character is already in this story");
  if (story.characterIds.length >= 6) throw AppError.badRequest("Use at most 6 characters");
  story.characterIds.push(char._id);
  if (!story.state.participants.includes(char.name)) story.state.participants.push(char.name);
  await story.save();
  res.json({ story, characters: (await Character.find({ _id: { $in: story.characterIds } }).select("name portraitUrl shortDescription")).map(brief) });
}

export async function removeCharacter(req: Request, res: Response) {
  const story = await owned(req);
  story.set("characterIds", story.characterIds.filter((id) => String(id) !== req.params.characterId));
  await story.save();
  res.json({ story });
}

export async function continueStory(req: Request, res: Response) {
  const story = await owned(req);
  const llm = getLLM(); // not configured -> clear error before anything is written
  const id = String(story._id);
  const input: string = req.body.input;
  if (story.sceneCount > 0 && !input) throw AppError.badRequest("Describe what you do next");
  if (generating.has(id)) throw AppError.conflict("The story is already being written");
  generating.add(id);
  try {
    const [chars, recentDesc, user] = await Promise.all([
      Character.find({ _id: { $in: story.characterIds } }),
      StoryScene.find({ storyId: story._id }).sort({ index: -1 }).limit(6),
      User.findById(req.userId).select("displayName"),
    ]);
    const state = story.toObject().state as StoryState;
    const messages = buildStoryMessages({
      story: { title: story.title, genre: story.genre, setting: story.setting, initialSituation: story.initialSituation, state },
      characters: chars.map((c) => c.toObject()),
      userName: user?.displayName ?? "",
      scenes: recentDesc.reverse().map((s) => ({ userInput: s.userInput, narration: s.narration })),
      input,
      mature: isMatureActive(story.contentRating),
    });

    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    const abort = new AbortController();
    res.on("close", () => { if (!res.writableEnded) abort.abort(); });

    try {
      const { narration, stateRaw } = await consumeStoryStream(llm.stream(messages, { signal: abort.signal }), (text) => sse(res, "delta", { text }));
      if (!narration) throw new ProviderError("bad_response", "The model returned an empty scene. Try again.");
      const update = parseStateUpdate(stateRaw);
      const scene = await StoryScene.create({
        storyId: story._id, index: story.sceneCount, userInput: input, narration: narration.slice(0, 12000),
        choices: update?.choices ?? [], stateUpdated: !!update,
      });
      if (update) story.set("state", applyStateUpdate(state, update));
      story.sceneCount += 1;
      story.lastActivityAt = new Date();
      await story.save();
      sse(res, "done", { scene, state: story.toObject().state, stateUpdated: !!update });
    } catch (e) {
      if (abort.signal.aborted) return;
      const err = e instanceof ProviderError ? e : null;
      if (!err) logger.error("Story generation failed", { err: e });
      sse(res, "error", { code: err?.code ?? "internal", message: err?.message ?? "Something went wrong while writing the scene." });
    } finally {
      res.end();
    }
  } finally {
    generating.delete(id);
  }
}
