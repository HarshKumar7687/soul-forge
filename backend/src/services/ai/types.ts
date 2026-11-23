export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  readonly capabilities: { streaming: boolean; embeddings?: boolean };
  complete(messages: ChatMessage[], opts?: GenerateOptions): Promise<string>;
  /** Optional. Only present when an embedding model is configured. */
  embed?(texts: string[], signal?: AbortSignal): Promise<number[][]>;
  /** Yields text chunks. Providers without streaming yield the whole reply once. */
  stream(messages: ChatMessage[], opts?: GenerateOptions): AsyncGenerator<string>;
}
