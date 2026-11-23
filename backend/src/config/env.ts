import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  // AI providers: optional now, validated where used (Phase 3+)
  LLM_PROVIDER: z.enum(["openrouter", "huggingface", "ollama"]).default("openrouter"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  LLM_BASE_URL: z.string().url().optional().or(z.literal("")),
  LLM_STREAMING: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(60000),
  LLM_MAX_TOKENS: z.coerce.number().int().min(16).max(8192).default(400),
  // Keep prompts small so local models stay fast: only a few recent messages, plus a few relevant memories.
  CHAT_HISTORY_MESSAGES: z.coerce.number().int().min(2).max(60).default(8),
  CHAT_HISTORY_CHARS: z.coerce.number().int().min(500).max(30000).default(4000),
  MEMORY_RETRIEVE_LIMIT: z.coerce.number().int().min(0).max(12).default(4),
  MEMORY_EVERY_MESSAGES: z.coerce.number().int().min(1).max(50).default(6),
  CHAT_REPLY_LENGTH: z.enum(["short", "medium", "long"]).default("short"),
  CHAT_SUMMARY: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.8),
  ALLOW_MATURE_CONTENT: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  UPLOAD_DIR: z.string().optional(),
  EMBEDDING_MODEL: z.string().optional(),
  IMAGE_PROVIDER: z.enum(["huggingface", "openai"]).default("huggingface"),
  IMAGE_BASE_URL: z.string().url().optional().or(z.literal("")),
  IMAGE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(90000),
  IMAGE_API_KEY: z.string().optional(),
  IMAGE_MODEL: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
  throw new Error(`Invalid environment configuration:\n${lines.join("\n")}\nSee .env.example`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
