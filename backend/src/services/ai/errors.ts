export type ProviderErrorKind =
  | "not_configured" | "auth" | "quota" | "model_unavailable"
  | "rate_limit" | "timeout" | "unavailable" | "bad_response";

const MESSAGES: Record<ProviderErrorKind, string> = {
  not_configured: "AI chat is not configured. Set LLM_API_KEY and LLM_MODEL in backend/.env, then restart the server.",
  auth: "The AI provider rejected the API key. Check LLM_API_KEY.",
  quota: "The AI provider reports no remaining credits or quota.",
  model_unavailable: "The configured model was not found or is unavailable. Check LLM_MODEL.",
  rate_limit: "The AI provider is rate limiting requests. Wait a moment and retry.",
  timeout: "The AI provider took too long to respond. Try again.",
  unavailable: "The AI provider is unavailable right now. Try again shortly.",
  bad_response: "The AI provider returned an unusable reply. Try again.",
};

const HTTP: Record<ProviderErrorKind, number> = {
  not_configured: 503, auth: 502, quota: 502, model_unavailable: 502,
  rate_limit: 429, timeout: 504, unavailable: 502, bad_response: 502,
};

/** User-safe error from an AI provider. Never contains keys or raw upstream bodies. */
export class ProviderError extends Error {
  constructor(public kind: ProviderErrorKind, message?: string) {
    super(message ?? MESSAGES[kind]);
    this.name = "ProviderError";
  }
  get status() { return HTTP[this.kind]; }
  get code() { return `ai_${this.kind}`; }
}

export function providerErrorFromStatus(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError("auth");
  if (status === 402) return new ProviderError("quota");
  if (status === 404) return new ProviderError("model_unavailable");
  if (status === 408 || status === 504) return new ProviderError("timeout");
  if (status === 429) return new ProviderError("rate_limit");
  return new ProviderError("unavailable");
}
