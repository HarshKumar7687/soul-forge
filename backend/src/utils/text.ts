/**
 * If the model stopped because it ran out of tokens, the reply ends mid-sentence.
 * Drop that unfinished tail, but only when the reply is long enough to have hit the limit
 * and most of it is kept.
 */
export function trimIncompleteTail(text: string, maxTokens: number): string {
  const t = text.trimEnd();
  if (!t || t.length < maxTokens * 2.5 || /[.!?…)"”'*]$/.test(t)) return t;
  const cut = Math.max(...[". ", "! ", "? ", ".\n", "!\n", "?\n"].map((s) => t.lastIndexOf(s)));
  return cut >= t.length * 0.5 ? t.slice(0, cut + 1) : t;
}
