import { connectDb } from "./config/db";
import { env } from "./config/env";
import { createApp } from "./app";
import { logger } from "./utils/logger";

async function main() {
  await connectDb(env.MONGODB_URI);
  createApp().listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));
}

main().catch((err) => {
  logger.error("Failed to start", { err });
  process.exit(1);
});
