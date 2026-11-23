export interface User {
  id: string;
  email: string;
  displayName: string;
  bio: string;
  replyLength?: "short" | "medium" | "long";
  avatarUrl: string;
  createdAt: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, string> };
}

export const CATEGORIES = [
  "fantasy", "mystery", "romance", "sci-fi", "thriller", "adventure", "slice-of-life", "historical", "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface Dialogue { user: string; character: string }

export interface CharacterInput {
  name: string;
  age: number | null;
  gender: string;
  category: Category;
  contentRating: "general" | "mature";
  shortDescription: string;
  appearance: string;
  personalityTraits: string[];
  backstory: string;
  speakingStyle: string;
  interests: string;
  dislikes: string;
  goals: string;
  relationshipWithUser: string;
  scenario: string;
  greeting: string;
  exampleDialogues: Dialogue[];
  visibility: "private" | "public";
  status: "draft" | "published";
  portraitUrl: string;
}

export interface Character extends CharacterInput {
  id: string;
  ownerId: string;
  chatCount: number;
  favoriteCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  kind: "greeting" | "message" | "reply";
  content: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  characterId: string;
  character: { id: string; name: string; portraitUrl: string } | null;
  lastMessagePreview: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface AiStatus {
  configured: boolean; provider: string; model: string | null; streaming: boolean;
  image: { configured: boolean; provider: string; model: string | null };
  matureAllowed: boolean;
  replyLength: "short" | "medium" | "long";
}

/** What other people see of a character. */
export type PublicCharacter = Pick<
  Character,
  "id" | "ownerId" | "name" | "age" | "gender" | "category" | "shortDescription" | "appearance" | "personalityTraits" | "greeting" | "portraitUrl" | "favoriteCount" | "chatCount" | "createdAt"
> & { creator?: { id: string; displayName: string }; isFavorite?: boolean };

export const MEMORY_TYPES = ["fact", "event", "relationship", "story", "preference"] as const;
export interface Memory {
  id: string; characterId: string; content: string; type: (typeof MEMORY_TYPES)[number]; source: "auto" | "manual"; updatedAt: string;
}

export const GENRES = ["fantasy", "mystery", "romance", "sci-fi", "thriller", "adventure", "other"] as const;
export interface StoryState {
  currentScene: string; participants: string[]; events: string[];
  threads: { text: string; resolved: boolean }[]; relationships: { a: string; b: string; note: string }[];
}
export interface Story {
  id: string; title: string; genre: (typeof GENRES)[number]; setting: string; initialSituation: string;
  contentRating: "general" | "mature"; characterIds: string[]; state: StoryState; sceneCount: number; lastActivityAt: string;
}
export interface Scene { id: string; index: number; userInput: string; narration: string; choices: string[]; stateUpdated: boolean }
export interface CharacterBrief { id: string; name: string; portraitUrl: string; shortDescription: string }
