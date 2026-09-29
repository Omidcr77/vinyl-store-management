import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import mongoose from "mongoose";
import User from "../models/User.js";
import LoginSession from "../models/LoginSession.js";
import AuthGuard from "../models/AuthGuard.js";
import Settings from "../models/Settings.js";
import { AppError } from "../utils/errors.js";
import { audit } from "./actor.js";
const scrypt = promisify(scryptCallback);
export const tokenHash = (token) =>
  createHash("sha256").update(token).digest("hex");
export const publicUser = (u) => ({
  _id: String(u._id),
  username: u.username,
  name: u.name,
  role: u.role,
  active: u.active,
  mustChangePassword: false,
  createdAt: u.createdAt,
  lastLoginAt: u.lastLoginAt,
});
export function validatePassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  )
    throw new AppError("رمز عبور باید بین 12 و 128 حرف باشد.");
}
export async function hashPassword(password) {
  validatePassword(password);
  const salt = randomBytes(16).toString("hex");
  const result = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `${salt}:${result.toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || password.length > 128) return false;
  const [salt, expected] = encoded.split(":");
  const actual = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const bytes = Buffer.from(expected, "hex");
  return bytes.length === actual.length && timingSafeEqual(bytes, actual);
}
export async function lockUsers(session) {
  await AuthGuard.updateOne(
    { _id: "users" },
    { $inc: { revision: 1 } },
    { session },
  );
}
export async function bootstrapAdmin({ username, name, password }) {
  username = String(username).trim().toLowerCase();
  if (!/^[a-z0-9_.-]{3,40}$/.test(username) || !name?.trim())
    throw new AppError("نام و نام کاربری معتبر وارد کنید.");
  const passwordHash = await hashPassword(password);
  return mongoose.connection.transaction(async (session) => {
    await lockUsers(session);
    if (await User.exists({}).session(session))
      throw new AppError("مدیر نخست قبلاً ساخته شده است.");
    const [u] = await User.create(
      [{ username, name: name.trim(), passwordHash, role: "admin" }],
      { session },
    );
    await audit("user.bootstrap", u._id, session, undefined, u);
    return publicUser(u);
  });
}
const cookieName = () =>
  process.env.NODE_ENV === "production"
    ? "__Host-store_session"
    : "store_session";
export function sessionToken(req) {
  const name = `${cookieName()}=`;
  const token = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name))
    ?.slice(name.length);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function cookie(res, token, expires) {
  res.cookie(cookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires,
  });
}
export async function issueSession(res, user) {
  const token = randomBytes(32).toString("hex");
  const csrf = randomBytes(32).toString("hex");
  const settings = await Settings.findById('store').lean();
  const minutes = settings?.sessionTimeoutMinutes ?? 480;
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);
  await LoginSession.create({
    _id: tokenHash(token),
    userId: user._id,
    authVersion: user.authVersion,
    csrf,
    expiresAt,
  });
  cookie(res, token, expiresAt);
  return { user: publicUser(user), csrf };
}
export async function authenticate(req) {
  const token = sessionToken(req);
  const session =
    token &&
    (await LoginSession.findOne({
      _id: tokenHash(token),
      expiresAt: { $gt: new Date() },
    }));
  const user = session && (await User.findById(session.userId));
  if (!user?.active || user.authVersion !== session.authVersion)
    throw new AppError("لطفاً وارد حساب خود شوید.", 401);
  return { user, session };
}
export async function revoke(userId, io) {
  await LoginSession.deleteMany({ userId });
  io?.to(`user:${userId}`).emit("auth:revoked");
  io?.in(`user:${userId}`).disconnectSockets(true);
}
export function protectSockets(io, origins) {
  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (origin && !origins.includes(origin))
        throw new Error("Origin rejected");
      const { user, session } = await authenticate(socket.request);
      socket.data.userId = String(user._id);
      socket.data.sessionId = session._id;
      socket.data.expiresAt = session.expiresAt;
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });
  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);
    socket.join(`session:${socket.data.sessionId}`);
    const timer = setTimeout(
      () => {
        socket.emit("auth:revoked");
        socket.disconnect(true);
      },
      Math.max(1, new Date(socket.data.expiresAt) - Date.now()),
    );
    timer.unref();
    socket.on("disconnect", () => clearTimeout(timer));
  });
}
