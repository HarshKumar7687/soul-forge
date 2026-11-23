import { env } from "../config/env";
import { Character } from "../models/Character";
import { Conversation } from "../models/Conversation";
import { Message } from "../models/Message";
import { User } from "../models/User";
import { logger } from "../utils/logger";
import type { AIProvider, ChatMessage } from "./ai";
import { extractAndSaveMemories } from "./memoryService";

const running = new Set<string>();
const controllers = new Map<string, AbortController>();

/** Stop background work for a conversation so the user's next message never waits behind it. */
export function cancelPostReplyTasks(conversationId: string) {
  controllers.get(conversationId)?.abort();
}

export function summaryMessages(opts: { characterName: string; userName: string; previous: string; messages: { role: string; content: string }[] }): ChatMessage[] {
  const u = opts.userName || "the user";
  const transcript = opts.messages.map((m) => `${m.role === "user" ? u : opts.characterName}: ${m.content}`).join("\n");
  return [
    {
      role: "system",
      content: `Summarize a roleplay conversation between ${opts.characterName} and ${u} so ${opts.characterName} can continue it consistently later.
Keep: key events in order, what each side learned or decided, promises, relationship changes, and the current situation. Drop filler. Write plain prose in under 250 words. Output only the summary.`,
    },
    { role: "user", content: `${opts.previous ? `Summary so far:\n${opts.previous}\n\n` : ""}New messages to fold in:\n${transcript}` },
  ];
}

/**
 * Background maintenance after a reply. Never throws.
 * - Memories: every MEMORY_EVERY_MESSAGES user messages, ask the model whether anything important happened.
 * - Summary (only when CHAT_SUMMARY=true): compress messages older than the recent window.
 * Both are cancelled as soon as the user sends another message.
 */
export async function runPostReplyTasks(conversationId: string, llm: AIProvider): Promise<void> {
  if (running.has(conversationId)) return;
  running.add(conversationId);
  const ctrl = new AbortController();
  controllers.set(conversationId, ctrl);
  const { signal } = ctrl;
  try {
    const conv = await Conversation.findById(conversationId);
    if (!conv || signal.aborted) return;
    const [character, user] = await Promise.all([Character.findById(conv.characterId).select("name"), User.findById(conv.userId).select("displayName")]);
    if (!character || signal.aborted) return;
    const userName = user?.displayName ?? "";

    // 1) Memories from messages we have not looked at yet
    try {
      const fresh = await Message.find({ conversationId: conv._id, kind: { $ne: "greeting" }, ...(conv.memoryCursor ? { createdAt: { $gt: conv.memoryCursor } } : {}) })
        .sort({ createdAt: 1, _id: 1 }).limit(60);
      if (fresh.filter((m) => m.role === "user").length >= env.MEMORY_EVERY_MESSAGES) {
        await extractAndSaveMemories({
          llm, signal, userId: String(conv.userId), characterId: String(conv.characterId), conversationId,
          characterName: character.name, userName,
          recent: fresh.slice(-Math.min(14, env.MEMORY_EVERY_MESSAGES * 2)).map((m) => ({ role: m.role, content: m.content })),
        });
        conv.memoryCursor = fresh[fresh.length - 1].createdAt;
        await conv.save();
      }
    } catch (e) {
      if (!signal.aborted) logger.warn("Memory extraction failed", { err: e });
    }

    // 2) Optional rolling summary of older history
    if (!env.CHAT_SUMMARY || signal.aborted) return;
    try {
      const keep = env.CHAT_HISTORY_MESSAGES;
      const unsummarized = await Message.find({ conversationId: conv._id, kind: { $ne: "greeting" }, ...(conv.summarizedThrough ? { createdAt: { $gt: conv.summarizedThrough } } : {}) })
        .sort({ createdAt: 1, _id: 1 });
      if (unsummarized.length > keep + 12) {
        const toFold = unsummarized.slice(0, unsummarized.length - keep).slice(0, 40);
        const summary = await llm.complete(
          summaryMessages({ characterName: character.name, userName, previous: conv.summary, messages: toFold.map((m) => ({ role: m.role, content: m.content })) }),
          { maxTokens: 500, temperature: 0.3, signal }
        );
        conv.summary = summary.trim().slice(0, 6000);
        conv.summarizedThrough = toFold[toFold.length - 1].createdAt;
        await conv.save();
      }
    } catch (e) {
      if (!signal.aborted) logger.warn("Summarization failed", { err: e });
    }
  } finally {
    running.delete(conversationId);
    if (controllers.get(conversationId) === ctrl) controllers.delete(conversationId);
  }
}
