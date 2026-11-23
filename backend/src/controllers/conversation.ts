import type { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import { Character } from "../models/Character";
import { Conversation } from "../models/Conversation";
import { Message } from "../models/Message";
import { User } from "../models/User";
import { env, isTest } from "../config/env";
import { buildMessages } from "../services/ai/characterPromptBuilder";
import { retrieveRelevant } from "../services/memoryService";
import { cancelPostReplyTasks, runPostReplyTasks } from "../services/postReplyTasks";
import { isMatureActive } from "../utils/content";
import { trimIncompleteTail } from "../utils/text";
import { isPublicVisible } from "../utils/serializers";
import { getLLM, ProviderError, type AIProvider } from "../services/ai";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

// One generation per conversation at a time (single-process; use a shared lock if you scale out).
const generating = new Set<string>();

const preview = (s: string) => s.replace(/\s+/g, " ").slice(0, 160);

function idParam(req: Request): string {
  const id = req.params.id;
  if (!isValidObjectId(id)) throw AppError.notFound("Conversation not found");
  return id;
}

async function ownedConversation(req: Request) {
  const conv = await Conversation.findOne({ _id: idParam(req), userId: req.userId });
  if (!conv) throw AppError.notFound("Conversation not found");
  return conv;
}

function sse(res: Response, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function create(req: Request, res: Response) {
  const character = await Character.findById(req.body.characterId);
  const allowed = character && (String(character.ownerId) === req.userId || isPublicVisible(character));
  if (!character || !allowed) throw AppError.notFound("Character not found");

  const greeting = character.greeting.trim();
  const conv = await Conversation.create({
    userId: req.userId,
    characterId: character._id,
    title: character.name,
    lastMessagePreview: preview(greeting),
    messageCount: greeting ? 1 : 0,
  });
  await Character.updateOne({ _id: character._id }, { $inc: { chatCount: 1 } });
  if (greeting) {
    await Message.create({ conversationId: conv._id, role: "assistant", kind: "greeting", content: greeting });
  }
  res.status(201).json({ conversation: conv });
}

export async function list(req: Request, res: Response) {
  const convs = await Conversation.find({ userId: req.userId }).sort({ lastMessageAt: -1 }).limit(100);
  const chars = await Character.find({ _id: { $in: convs.map((c) => c.characterId) } }).select("name portraitUrl");
  const byId = new Map(chars.map((c) => [String(c._id), { id: String(c._id), name: c.name, portraitUrl: c.portraitUrl }]));
  res.json({
    conversations: convs.map((c) => ({ ...c.toJSON(), character: byId.get(String(c.characterId)) ?? null })),
  });
}

export async function get(req: Request, res: Response) {
  const conv = await ownedConversation(req);
  const [character, messages] = await Promise.all([
    Character.findById(conv.characterId).select("name portraitUrl shortDescription"),
    Message.find({ conversationId: conv._id }).sort({ createdAt: 1, _id: 1 }).limit(500),
  ]);
  res.json({
    conversation: conv,
    character: character ? { id: String(character._id), name: character.name, portraitUrl: character.portraitUrl, shortDescription: character.shortDescription } : null,
    messages,
  });
}

export async function remove(req: Request, res: Response) {
  const conv = await ownedConversation(req);
  await Message.deleteMany({ conversationId: conv._id });
  await conv.deleteOne();
  res.status(204).end();
}

/** Stream a reply for the conversation. `replacing` is the old reply to swap out on success. */
async function respond(
  req: Request,
  res: Response,
  convId: string,
  llm: AIProvider,
  opts: { replacingId?: string; onOpen?: () => void } = {}
) {
  const { replacingId, onOpen } = opts;
  const conv = await Conversation.findById(convId);
  const character = conv && (await Character.findById(conv.characterId));
  if (!conv || !character) throw AppError.notFound("This character no longer exists");
  const user = await User.findById(req.userId).select("displayName replyLength");
  const replyLength = user?.replyLength ?? env.CHAT_REPLY_LENGTH; // the website setting wins over the server default

  // Only the last few messages go to the model. Anything important lives in memories instead.
  const filter: Record<string, unknown> = { conversationId: conv._id, kind: { $ne: "greeting" } };
  if (replacingId) filter._id = { $ne: replacingId };
  if (env.CHAT_SUMMARY && conv.summarizedThrough) filter.createdAt = { $gt: conv.summarizedThrough };
  const rows = await Message.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(env.CHAT_HISTORY_MESSAGES);
  const history = rows.reverse().map((m) => ({ role: m.role, content: m.content, kind: m.kind }));
  if (history[history.length - 1]?.role !== "user") throw AppError.badRequest("There is no message to reply to");

  let memories: string[] = [];
  try {
    if (env.MEMORY_RETRIEVE_LIMIT > 0) memories = await retrieveRelevant({
      userId: String(req.userId), characterId: String(character._id), llm, limit: env.MEMORY_RETRIEVE_LIMIT,
      queryText: history.filter((m) => m.role === "user").slice(-3).map((m) => m.content).join("\n"),
    });
  } catch (e) {
    logger.warn("Memory retrieval failed; continuing without memories", { err: e });
  }

  const messages = buildMessages({ character: character.toObject(), userName: user?.displayName ?? "", history, memories, summary: env.CHAT_SUMMARY ? conv.summary : "", maxHistoryChars: env.CHAT_HISTORY_CHARS, replyLength, mature: isMatureActive(character.contentRating) });

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  onOpen?.();

  const abort = new AbortController();
  res.on("close", () => { if (!res.writableEnded) abort.abort(); });

  try {
    let full = "";
    const maxTokens = Math.min(env.LLM_MAX_TOKENS, { short: 220, medium: 350, long: env.LLM_MAX_TOKENS }[replyLength]);
    for await (const chunk of llm.stream(messages, { signal: abort.signal, maxTokens })) {
      full += chunk;
      sse(res, "delta", { text: chunk });
    }
    full = trimIncompleteTail(full.trim(), maxTokens);
    if (!full) throw new ProviderError("bad_response", "The model returned an empty reply. Try again.");
    if (replacingId) await Message.deleteOne({ _id: replacingId, conversationId: conv._id });
    const saved = await Message.create({ conversationId: conv._id, role: "assistant", kind: "reply", content: full.slice(0, 8000), model: llm.model });
    conv.lastMessagePreview = preview(full);
    conv.lastMessageAt = new Date();
    conv.messageCount = await Message.countDocuments({ conversationId: conv._id });
    await conv.save();
    sse(res, "done", { message: saved, replacedId: replacingId ?? null });
    const post = runPostReplyTasks(convId, llm); // memories + summaries; never throws
    if (isTest) await post;
  } catch (e) {
    if (abort.signal.aborted) return; // client left; nothing to report
    const err = e instanceof ProviderError ? e : null;
    if (!err) logger.error("Chat generation failed", { err: e });
    sse(res, "error", {
      code: err?.code ?? "internal",
      message: err?.message ?? "Something went wrong while generating the reply.",
    });
  } finally {
    res.end();
  }
}

export async function sendMessage(req: Request, res: Response) {
  const conv = await ownedConversation(req);
  const llm = getLLM(); // throws ai_not_configured before anything is saved
  const id = String(conv._id);
  if (generating.has(id)) throw AppError.conflict("A reply is already being written for this conversation");
  generating.add(id);
  cancelPostReplyTasks(id); // never make this message wait behind background work
  try {
    const userMsg = await Message.create({ conversationId: conv._id, role: "user", kind: "message", content: req.body.content });
    conv.lastMessagePreview = preview(req.body.content);
    conv.lastMessageAt = new Date();
    conv.messageCount += 1;
    await conv.save();
    await respond(req, res, id, llm, { onOpen: () => sse(res, "user", { message: userMsg }) });
  } finally {
    generating.delete(id);
  }
}

export async function regenerate(req: Request, res: Response) {
  const conv = await ownedConversation(req);
  const llm = getLLM();
  const id = String(conv._id);
  if (generating.has(id)) throw AppError.conflict("A reply is already being written for this conversation");
  generating.add(id);
  cancelPostReplyTasks(id);
  try {
    const last = await Message.findOne({ conversationId: conv._id }).sort({ createdAt: -1, _id: -1 });
    if (!last) throw AppError.badRequest("Nothing to regenerate");
    if (last.role === "assistant" && last.kind === "greeting") throw AppError.badRequest("Send a message first");
    await respond(req, res, id, llm, { replacingId: last.role === "assistant" ? String(last._id) : undefined });
  } finally {
    generating.delete(id);
  }
}
