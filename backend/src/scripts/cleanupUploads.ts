/**
 * Deletes uploaded images that no character references and that are older than 24 hours.
 * Run occasionally (cron): npm run cleanup:uploads
 */
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { connectDb } from "../config/db";
import { env } from "../config/env";
import { Character } from "../models/Character";
import { UPLOAD_DIR } from "../services/uploads";

async function main() {
  await connectDb(env.MONGODB_URI);
  const used = new Set((await Character.find({ portraitUrl: { $ne: "" } }).select("portraitUrl")).map((c) => c.portraitUrl));
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const name of await fs.readdir(UPLOAD_DIR)) {
    if (!/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(name) || used.has(`/uploads/${name}`)) continue;
    const file = path.join(UPLOAD_DIR, name);
    if ((await fs.stat(file)).mtimeMs < cutoff) { await fs.unlink(file); removed++; }
  }
  console.log(`Removed ${removed} unused upload(s)`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
