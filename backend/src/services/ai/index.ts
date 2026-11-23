import { env } from "../../config/env";
import { ProviderError } from "./errors";
import { HuggingFaceProvider } from "./HuggingFaceProvider";
import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider";
import { OpenRouterProvider } from "./OpenRouterProvider";
import type { AIProvider } from "./types";

export * from "./errors";
export * from "./types";

let override: AIProvider | null = null;
/** Test hook: swap the provider. Never used in production code paths. */
export function setLLMProviderForTests(p: AIProvider | null) { override = p; }

/** Ollama runs locally and needs no API key, only a model name. */
export function llmConfigured(): boolean {
  if (override) return true;
  if (env.LLM_PROVIDER === "ollama") return !!env.LLM_MODEL;
  return !!env.LLM_API_KEY && !!env.LLM_MODEL;
}

/** Throws ProviderError("not_configured") when credentials are missing. */
export function getLLM(): AIProvider {
  if (override) return override;
  if (!llmConfigured()) {
    throw env.LLM_PROVIDER === "ollama"
      ? new ProviderError("not_configured", "Ollama is not configured. Set LLM_MODEL (a name from `ollama list`) in backend/.env, then restart the server.")
      : new ProviderError("not_configured");
  }
  const cfg = {
    apiKey: env.LLM_API_KEY || "ollama",
    model: env.LLM_MODEL as string,
    baseUrl: env.LLM_BASE_URL || undefined,
    timeoutMs: env.LLM_TIMEOUT_MS,
    streaming: env.LLM_STREAMING,
    maxTokens: env.LLM_MAX_TOKENS,
    temperature: env.LLM_TEMPERATURE,
    embeddingModel: env.EMBEDDING_MODEL || undefined,
  };
  if (env.LLM_PROVIDER === "ollama") {
    return new OpenAICompatibleProvider({ ...cfg, name: "ollama", baseUrl: cfg.baseUrl || "http://localhost:11434/v1" });
  }
  return env.LLM_PROVIDER === "huggingface" ? new HuggingFaceProvider(cfg) : new OpenRouterProvider(cfg);
}

/** Safe to send to the browser: never includes keys. */
export function llmStatus() {
  const configured = llmConfigured();
  return {
    configured,
    provider: override?.name ?? env.LLM_PROVIDER,
    model: configured ? override?.model ?? env.LLM_MODEL : null,
    streaming: override?.capabilities.streaming ?? env.LLM_STREAMING,
  };
}
