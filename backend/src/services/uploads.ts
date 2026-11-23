import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env";
import { Character } from "../models/Character";
import { AppError } from "../utils/AppError";

export const UPLOAD_DIR = env.UPLOAD_DIR ? path.resolve(env.UPLOAD_DIR) : path.resolve(__dirname, "../../uploads");
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Identify the image type from its bytes, never from the client's claim. */
function sniff(buf: Buffer): "png" | "jpg" | "webp" | null {
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 12 && buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "webp";
  return null;
}

export async function saveImage(buf: Buffer): Promise<string> {
  const ext = sniff(buf);
  if (!ext) throw AppError.badRequest("Upload a PNG, JPEG or WebP image");
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomBytes(16).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(UPLOAD_DIR, name), buf, { flag: "wx" });
  return `/uploads/${name}`;
}

const FILE_RE = /^\/uploads\/([a-f0-9]{32}\.(png|jpg|webp))$/;

/** Deletes an uploaded portrait if no character references it any more. Safe to call with any string. */
export async function deleteUploadIfUnused(url: string | undefined | null): Promise<void> {
  const m = url ? FILE_RE.exec(url) : null;
  if (!m) return;
  if (await Character.exists({ portraitUrl: url })) return;
  await fs.unlink(path.join(UPLOAD_DIR, m[1])).catch((e) => { if (e.code !== "ENOENT") throw e; });
}
