import bcrypt from "bcryptjs";
import type { CookieOptions, Request, Response } from "express";
import { isProd } from "../config/env";
import { COOKIE_NAME, signToken } from "../middleware/auth";
import { User } from "../models/User";
import { deleteUserData } from "../services/accountCleanup";
import { AppError } from "../utils/AppError";

const BCRYPT_ROUNDS = 12;
// Keeps login timing similar when the email does not exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: isProd,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

function sendSession(res: Response, status: number, user: InstanceType<typeof User>) {
  res.cookie(COOKIE_NAME, signToken(String(user._id)), cookieOptions);
  res.status(status).json({ user });
}

function clearSession(res: Response) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
}

export async function register(req: Request, res: Response) {
  const { email, password, displayName } = req.body;
  if (await User.exists({ email })) throw AppError.conflict("An account with this email already exists");
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({ email, passwordHash, displayName });
  sendSession(res, 201, user);
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+passwordHash");
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, "Email or password is incorrect", "invalid_credentials");
  sendSession(res, 200, user);
}

export async function logout(_req: Request, res: Response) {
  clearSession(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  const user = await User.findById(req.userId);
  if (!user) throw AppError.unauthorized();
  res.json({ user });
}

export async function updateMe(req: Request, res: Response) {
  const user = await User.findByIdAndUpdate(req.userId, { $set: req.body }, { new: true, runValidators: true });
  if (!user) throw AppError.unauthorized();
  res.json({ user });
}

export async function deleteMe(req: Request, res: Response) {
  const user = await User.findById(req.userId).select("+passwordHash");
  if (!user) throw AppError.unauthorized();
  if (!(await bcrypt.compare(req.body.password, user.passwordHash))) {
    throw new AppError(401, "Password is incorrect", "invalid_credentials");
  }
  await deleteUserData(String(user._id));
  await user.deleteOne();
  clearSession(res);
  res.status(204).end();
}
