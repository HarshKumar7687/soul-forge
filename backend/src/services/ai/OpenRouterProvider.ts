import { env } from "../../config/env";
import { OpenAICompatibleProvider, type ProviderConfig } from "./OpenAICompatibleProvider";

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor(cfg: Omit<ProviderConfig, "name" | "baseUrl" | "extraHeaders"> & { baseUrl?: string }) {
    super({
      ...cfg,
      name: "openrouter",
      baseUrl: cfg.baseUrl || "https://openrouter.ai/api/v1",
      extraHeaders: { "HTTP-Referer": env.FRONTEND_URL, "X-Title": "SoulForge AI" },
    });
  }
}
