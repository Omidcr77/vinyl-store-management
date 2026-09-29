import { Router } from "express";
import multer from "multer";
import { readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { allowRoles } from "../middleware/auth.js";
import { authenticate, cookie } from "../services/authService.js";
import { audit } from "../services/actor.js";
import { AppError } from "../utils/errors.js";
import { withMaintenance } from "../services/maintenanceService.js";
import {
  MAX_BACKUP_BYTES,
  backupsDirectory,
  createBackup,
  validateBackup,
  restoreBackup,
} from "../services/backupService.js";
const router = Router();
router.use(allowRoles("admin"));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BACKUP_BYTES, files: 1, fields: 2, fieldSize: 200 },
}).single("backup");
const receive = (req, res, next) =>
  upload(req, res, (error) =>
    next(
      error
        ? new AppError("یک فایل بکاپ حداکثر 100 MB انتخاب کنید.", 400)
        : undefined,
    ),
  );
const currentAdmin = async (req) => {
  const { user } = await authenticate(req);
  if (user.role !== "admin")
    throw new AppError("تنها مدیر سیستم اجازه دارد.", 403);
  return user;
};
const filename = /^before-restore-\d+-[a-f0-9-]{36}\.vinyl-backup\.gz$/;
router.get("/export", async (req, res) => {
  const { buffer } = await withMaintenance(async () => {
    const user = await currentAdmin(req);
    const result = await createBackup();
    await audit("backup.export", "store", undefined, undefined, user);
    return result;
  });
  res
    .type("application/gzip")
    .attachment(
      `store-${new Date().toISOString().replaceAll(":", "-")}.vinyl-backup.gz`,
    )
    .send(buffer);
});
router.post("/preview", receive, async (req, res) => {
  const result = await validateBackup(req.file?.buffer);
  res.json({
    success: true,
    data: { ...result.summary, digest: result.digest },
  });
});
router.post("/restore", receive, async (req, res) => {
  if (req.body?.confirmation !== "RESTORE")
    throw new AppError("جایگزینی تمام معلومات را تأیید کنید.");
  const validated = await validateBackup(req.file?.buffer);
  if (req.body?.digest !== validated.digest)
    throw new AppError(
      "فایل تغییر کرده است. نخست بکاپ را دوباره بررسی کنید.",
      409,
    );
  const result = await withMaintenance(async () =>
    restoreBackup(validated, await currentAdmin(req)),
  );
  cookie(res, "", new Date(0));
  res.once("finish", () => {
    req.app.get("io")?.emit("auth:revoked");
    req.app.get("io")?.disconnectSockets(true);
  });
  res.json({ success: true, data: result });
});
router.get("/recovery", async (req, res) => {
  let names;
  try {
    names = await readdir(backupsDirectory());
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    names = [];
  }
  const items = [];
  for (const name of names
    .filter((n) => filename.test(n))
    .sort()
    .reverse()
    .slice(0, 10)) {
    const info = await lstat(join(backupsDirectory(), name));
    if (info.isFile())
      items.push({
        name,
        size: info.size,
        createdAt: info.mtime.toISOString(),
      });
  }
  res.json({ success: true, data: items });
});
router.get("/recovery/:name", async (req, res, next) => {
  if (!filename.test(req.params.name))
    throw new AppError("فایل یافت نشد.", 404);
  try {
    if (!(await lstat(join(backupsDirectory(), req.params.name))).isFile())
      throw new Error("Not a regular backup");
  } catch {
    throw new AppError("فایل یافت نشد.", 404);
  }
  res.download(
    join(backupsDirectory(), req.params.name),
    req.params.name,
    (error) => {
      if (error && !res.headersSent) next(new AppError("فایل یافت نشد.", 404));
    },
  );
});
export default router;
