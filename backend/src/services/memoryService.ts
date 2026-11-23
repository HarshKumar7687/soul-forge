import { Memory, MEMORY_TYPES } from "../models/Memory";
import type { AIProvider, ChatMessage } from "./ai";
import { logger } from "../utils/logger";

const MAX_PER_PAIR = 200;
const STOP = new Set("the and for you that with this have are was were but not your from they them what when where who why how can will just about into than then there their been being would could should also very much more some any all out our his her she him its it's i'm i've don't".split(" "));

export const tokenize = (text: string): Set<string> =>
  new Set(text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)));

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export interface RankableMemory { content: string; type: string; updatedAt: Date; embedding?: number[] }

/** Keep only memories that relate to the query. Semantic match when embeddings exist, word overlap otherwise. */
export function rankMemories<T extends RankableMemory>(memories: T[], queryText: string, queryEmbedding?: number[], limit = 6): T[] {
  const q = tokenize(queryText);
  const now = Date.now();
  const scored = memories.map((m) => {
    const words = tokenize(m.content);
    let overlap = 0;
    q.forEach((w) => { if (words.has(w)) overlap++; });
    const kw = words.size ? overlap / Math.min(words.size, Math.max(q.size, 1)) : 0;
    const sem = queryEmbedding && m.embedding?.length ? cosine(queryEmbedding, m.embedding) : 0;
    const relevance = Math.max(kw, sem >= 0.35 ? sem : 0);
    const ageDays = (now - new Date(m.updatedAt).getTime()) / 86400000;
    return { m, relevance, score: relevance * 3 + 0.5 / (1 + ageDays / 30) };
  });
  return scored.filter((s) => s.relevance > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.m);
}

export async function retrieveRelevant(opts: {
  userId: string; characterId: string; queryText: string; llm?: AIProvider; limit?: number;
}): Promise<string[]> {
  const memories = (await Memory.find({ userId: opts.userId, characterId: opts.characterId })
    .select("+embedding").sort({ updatedAt: -1 }).limit(MAX_PER_PAIR).lean()) as unknown as RankableMemory[];
  if (!memories.length) return [];
  let qe: number[] | undefined;
  if (opts.llm?.embed && memories.some((m) => m.embedding?.length)) {
    try { qe = (await opts.llm.embed([opts.queryText]))[0]; } catch (e) { logger.warn("Query embedding failed, using keywords", { err: e }); }
  }
  const picked = rankMemories(memories, opts.queryText, qe, opts.limit ?? 6);
  // Always keep the latest relationship note so the bond stays continuous.
  const rel = memories.find((m) => m.type === "relationship");
  if (rel && !picked.includes(rel)) picked.push(rel);
  return picked.map((m) => m.content);
}

/** Embeddings are optional: any failure just means the memory is found by keywords. */
export async function embedSafely(llm: AIProvider | undefined, text: string): Promise<number[] | undefined> {
  if (!llm?.embed) return undefined;
  try { return (await llm.embed([text]))[0]; } catch (e) { logger.warn("Embedding failed", { err: e }); return undefined; }
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
export function isDuplicate(candidate: string, existing: string[]): boolean {
  const c = norm(candidate);
  const ct = tokenize(candidate);
  return existing.some((e) => {
    if (norm(e) === c) return true;
    const et = tokenize(e);
    let inter = 0; ct.forEach((w) => { if (et.has(w)) inter++; });
    const union = ct.size + et.size - inter;
    return union > 0 && inter / union >= 0.7;
  });
}

export interface Candidate { content: string; type: (typeof MEMORY_TYPES)[number] }

/** Pull a JSON array out of a model reply, tolerating code fences and chatter. */
export function parseCandidates(raw: string): Candidate[] {
  const start = raw.indexOf("["), end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let arr: unknown;
  try { arr = JSON.parse(raw.slice(start, end + 1)); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: Candidate[] = [];
  for (const x of arr) {
    const o = x as { content?: unknown; type?: unknown };
    const content = typeof o?.content === "string" ? o.content.trim() : "";
    if (content.length < 8 || content.length > 300) continue;
    const type = (MEMORY_TYPES as readonly string[]).includes(o.type as string) ? (o.type as Candidate["type"]) : "fact";
    out.push({ content, type });
  }
  return out.slice(0, 3);
}

export function extractionMessages(opts: { characterName: string; userName: string; recent: { role: string; content: string }[]; existing: string[] }): ChatMessage[] {
  const u = opts.userName || "the user";
  const transcript = opts.recent.map((m) => `${m.role === "user" ? u : opts.characterName}: ${m.content}`).join("\n");
  return [
    {
      role: "system",
      content: `You maintain long-term memory for the character ${opts.characterName}. Read the transcript and decide whether anything is worth remembering in future conversations.
Only save durable, important items: facts ${u} stated about themselves, significant events, relationship developments, important story details, or preferences established in the conversation.
Do NOT save small talk, greetings, passing remarks, anything the character already knows, or details that only matter in the moment. Saving nothing is the right answer most of the time.
Write each memory as one short sentence from ${opts.characterName}'s point of view (for example: "${u} is afraid of deep water."). Maximum 3 memories.
Reply with ONLY a JSON array like [{"content":"...","type":"fact"}]. Valid types: ${MEMORY_TYPES.join(", ")}. Reply [] if nothing qualifies.
${opts.existing.length ? `Already remembered (do not repeat):\n${opts.existing.map((e) => `- ${e}`).join("\n")}` : ""}`,
    },
    { role: "user", content: `Transcript:\n${transcript}` },
  ];
}

export async function extractAndSaveMemories(opts: {
  llm: AIProvider; userId: string; characterId: string; conversationId: string;
  characterName: string; userName: string; recent: { role: string; content: string }[]; signal?: AbortSignal;
}): Promise<number> {
  const existingDocs = await Memory.find({ userId: opts.userId, characterId: opts.characterId }).select("content").sort({ updatedAt: -1 }).limit(60).lean();
  const existing = existingDocs.map((m) => m.content);
  const raw = await opts.llm.complete(extractionMessages({ ...opts, existing }), { maxTokens: 400, temperature: 0.2, signal: opts.signal });
  let saved = 0;
  for (const c of parseCandidates(raw)) {
    if (isDuplicate(c.content, existing)) continue;
    const embedding = await embedSafely(opts.llm, c.content);
    await Memory.create({
      userId: opts.userId, characterId: opts.characterId, conversationId: opts.conversationId,
      content: c.content, type: c.type, source: "auto", ...(embedding ? { embedding } : {}),
    });
    existing.push(c.content);
    saved++;
  }
  // Keep the store bounded: drop the oldest automatic memories first.
  const total = await Memory.countDocuments({ userId: opts.userId, characterId: opts.characterId });
  if (total > MAX_PER_PAIR) {
    const old = await Memory.find({ userId: opts.userId, characterId: opts.characterId, source: "auto" }).sort({ updatedAt: 1 }).limit(total - MAX_PER_PAIR).select("_id");
    await Memory.deleteMany({ _id: { $in: old.map((o) => o._id) } });
  }
  return saved;
}
