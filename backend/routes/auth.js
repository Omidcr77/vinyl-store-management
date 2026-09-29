import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import User from "../models/User.js";
import LoginSession from "../models/LoginSession.js";
import AuditEvent from "../models/AuditEvent.js";
import {
  requireAuth,
  csrf,
  allowRoles,
} from "../middleware/auth.js";
import {
  publicUser,
  hashPassword,
  verifyPassword,
  issueSession,
  cookie,
  revoke,
  lockUsers,
  sessionToken,
  tokenHash,
} from "../services/authService.js";
import { audit } from "../services/actor.js";
import { AppError, required } from "../utils/errors.js";
import { id } from "../utils/validation.js";
import { list } from "../utils/query.js";
const router = Router();
const send = (res, data, status = 200) =>
  res.status(status).json({ success: true, data });
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.-]{3,40}$/);
const fields = z.object({
  username,
  name: z.string().trim().min(1).max(100),
  role: z.enum(["admin", "manager", "staff"]),
});
const attempts = new Map();
function limit(req, key) {
  for (const label of [`ip:${req.ip}`, `account:${key}`]) {
    const now = Date.now();
    let entry = attempts.get(label);
    if (!entry || entry.until < now)
      entry = { count: 0, until: now + 15 * 60 * 1000 };
    entry.count++;
    attempts.set(label, entry);
    if (entry.count > (label.startsWith("ip:") ? 40 : 10))
      throw new AppError("کوشش‌های زیاد. 15 دقیقه بعد دوباره کوشش کنید.", 429);
  }
  if (attempts.size > 20000) attempts.delete(attempts.keys().next().value);
}
// Custom header + exact origin allowlist prevent login CSRF; authenticated writes also require a session token.
router.post("/login", async (req, res) => {
  if (
    req.get("X-Requested-With") !== "store-app" ||
    !req.is("application/json")
  )
    throw new AppError("درخواست معتبر نیست.", 403);
  const input = z
    .object({ username, password: z.string().min(1).max(128) })
    .parse(req.body);
  limit(req, input.username);
  const user = await User.findOne({ username: input.username }).select(
    "+passwordHash",
  );
  // Use the same password derivation for unknown usernames to avoid a fast timing oracle.
  const valid = await verifyPassword(
    input.password,
    user?.passwordHash || `${"0".repeat(32)}:${"0".repeat(128)}`,
  );
  if (!valid || !user?.active)
    throw new AppError("نام کاربری یا رمز عبور درست نیست.", 401);
  user.lastLoginAt = new Date();
  await user.save();
  const previous = sessionToken(req);
  if (previous) {
    await LoginSession.deleteOne({ _id: tokenHash(previous) });
    req.app
      .get("io")
      ?.in(`session:${tokenHash(previous)}`)
      .disconnectSockets(true);
  }
  const data = await issueSession(res, user);
  await audit("auth.login", user._id, undefined, undefined, user);
  send(res, data);
});
router.use(requireAuth, csrf);
router.get("/session", (req, res) =>
  send(res, { user: publicUser(req.user), csrf: req.loginSession.csrf }),
);
router.post("/logout", async (req, res) => {
  await LoginSession.deleteOne({ _id: req.loginSession._id });
  req.app
    .get("io")
    ?.in(`session:${req.loginSession._id}`)
    .disconnectSockets(true);
  cookie(res, "", new Date(0));
  send(res, { message: "خارج شدید." });
});
router.post("/password", async (req, res) => {
  const input = z
    .object({
      currentPassword: z.string().max(128),
      password: z.string().min(12).max(128),
    })
    .parse(req.body);
  limit(req, `password:${req.user._id}`);
  if (input.password === input.currentPassword)
    throw new AppError("رمز جدید باید متفاوت باشد.");
  const encoded = await hashPassword(input.password);
  await mongoose.connection.transaction(async (session) => {
    await lockUsers(session);
    const user = await User.findById(req.user._id)
      .select("+passwordHash")
      .session(session);
    if (
      !user.active ||
      user.authVersion !== req.user.authVersion ||
      !(await verifyPassword(input.currentPassword, user.passwordHash))
    )
      throw new AppError("رمز فعلی درست نیست.", 400);
    user.passwordHash = encoded;
    user.mustChangePassword = false;
    user.authVersion++;
    await user.save({ session });
    await audit("auth.password", user._id, session);
  });
  await revoke(req.user._id, req.app.get("io"));
  cookie(res, "", new Date(0));
  send(res, { message: "رمز تغییر کرد. دوباره وارد شوید." });
});
export default router;

export const usersRouter = Router();
usersRouter.use(allowRoles("admin"));
usersRouter.get("/", async (req, res) => {
  const result = await list(User, {}, req.query, ["username", "createdAt"]);
  send(res, { ...result, items: result.items.map(publicUser) });
});
usersRouter.post("/", async (req, res) => {
  const input = fields
    .extend({ password: z.string().min(12).max(128) })
    .parse(req.body);
  const passwordHash = await hashPassword(input.password);
  const user = await mongoose.connection.transaction(async (session) => {
    await lockUsers(session);
    await checkAdmin(req, session);
    const [created] = await User.create(
      [
        {
          username: input.username,
          name: input.name,
          role: input.role,
          passwordHash,
        },
      ],
      { session },
    );
    await audit(
      "user.create",
      created._id,
      session,
      `${created.username}: ${created.role}`,
    );
    return created;
  });
  send(res, publicUser(user), 201);
});
async function checkAdmin(req, session) {
  if (
    !(await User.exists({
      _id: req.user._id,
      active: true,
      role: "admin",
      authVersion: req.user.authVersion,
    }).session(session))
  )
    throw new AppError("دسترسی شما تغییر کرده است.", 403);
}
usersRouter.put("/:id", async (req, res) => {
  const input = fields
    .extend({
      active: z.boolean(),
      password: z.string().min(12).max(128).optional(),
    })
    .parse(req.body);
  const passwordHash = input.password
    ? await hashPassword(input.password)
    : null;
  const userId = id.parse(req.params.id);
  const user = await mongoose.connection.transaction(async (session) => {
    await lockUsers(session);
    await checkAdmin(req, session);
    const u = required(await User.findById(userId).session(session));
    if (
      u.active &&
      u.role === "admin" &&
      (!input.active || input.role !== "admin") &&
      (await User.countDocuments({ active: true, role: "admin" }).session(
        session,
      )) <= 1
    )
      throw new AppError(
        "آخرین مدیر فعال را نمی‌توان غیرفعال کرد یا نقش او را تغییر داد.",
        409,
      );
    const old = `${u.username}: ${u.role}, ${u.active}`;
    Object.assign(u, {
      username: input.username,
      name: input.name,
      role: input.role,
      active: input.active,
    });
    u.authVersion++;
    if (passwordHash) {
      u.passwordHash = passwordHash;
      u.mustChangePassword = false;
    }
    await u.save({ session });
    await audit(
      "user.update",
      u._id,
      session,
      `${old} → ${u.username}: ${u.role}, ${u.active}${passwordHash ? " (password reset)" : ""}`,
    );
    return u;
  });
  await revoke(userId, req.app.get("io"));
  send(res, publicUser(user));
});
export const auditRouter = Router();
auditRouter.use(allowRoles("admin"));
auditRouter.get("/", async (req, res) =>
  send(res, await list(AuditEvent, {}, req.query, ["date"])),
);
