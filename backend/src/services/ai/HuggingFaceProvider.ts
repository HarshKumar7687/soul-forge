import { OpenAICompatibleProvider, type ProviderConfig } from "./OpenAICompatibleProvider";

/** Hugging Face Inference Providers expose an OpenAI-compatible router. */
export class HuggingFaceProvider extends OpenAICompatibleProvider {
  constructor(cfg: Omit<ProviderConfig, "name" | "baseUrl"> & { baseUrl?: string }) {
    super({ ...cfg, name: "huggingface", baseUrl: cfg.baseUrl || "https://router.huggingface.co/v1" });
  }
}
