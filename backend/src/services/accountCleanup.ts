import type { FilterQuery, Types } from "mongoose";
import { Character } from "../models/Character";
import { Conversation, type ConversationDoc } from "../models/Conversation";
import { Favorite } from "../models/Favorite";
import { Memory } from "../models/Memory";
import { Message } from "../models/Message";
import { Report } from "../models/Report";
import { Story } from "../models/Story";
import { StoryScene } from "../models/StoryScene";
import { deleteUploadIfUnused } from "./uploads";

/** Deletes matching conversations and their messages. */
export async function deleteConversationsWhere(filter: FilterQuery<ConversationDoc>) {
  const ids = (await Conversation.find(filter).select("_id")).map((c) => c._id);
  if (!ids.length) return;
  await Message.deleteMany({ conversationId: { $in: ids } });
  await Conversation.deleteMany({ _id: { $in: ids } });
}

/** Cleans everything that hangs off a character (not the character itself). */
export async function deleteCharacterDependents(characterIds: Types.ObjectId[]) {
  if (!characterIds.length) return;
  await deleteConversationsWhere({ characterId: { $in: characterIds } });
  await Memory.deleteMany({ characterId: { $in: characterIds } });
  await Favorite.deleteMany({ characterId: { $in: characterIds } });
  await Report.deleteMany({ characterId: { $in: characterIds } });
  await Story.updateMany({ characterIds: { $in: characterIds } }, { $pull: { characterIds: { $in: characterIds } } } as never);
}

export async function deleteStoriesWhere(filter: Record<string, unknown>) {
  const ids = (await Story.find(filter).select("_id")).map((s) => s._id);
  if (!ids.length) return;
  await StoryScene.deleteMany({ storyId: { $in: ids } });
  await Story.deleteMany({ _id: { $in: ids } });
}

/** Removes everything a user owns or created. */
export async function deleteUserData(userId: string) {
  const mine = await Character.find({ ownerId: userId }).select("_id portraitUrl");
  const ids = mine.map((c) => c._id);
  await deleteConversationsWhere({ userId });
  await deleteStoriesWhere({ userId });
  await Memory.deleteMany({ userId });
  await Favorite.deleteMany({ userId });
  await Report.deleteMany({ reporterId: userId });
  await deleteCharacterDependents(ids);
  await Character.deleteMany({ ownerId: userId });
  for (const c of mine) await deleteUploadIfUnused(c.portraitUrl);
}
