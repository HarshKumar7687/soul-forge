import mongoose from "mongoose";
import { logger } from "../utils/logger";

export async function connectDb(uri: string): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  logger.info("MongoDB connected");
}
