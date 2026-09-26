import multer from "multer";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { uploadsDirectory } from "../config/storage.js";
import { AppError } from "../utils/errors.js";

export const receiveImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  fileFilter(req, file, callback) {
    callback(
      ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)
        ? null
        : new AppError("تنها عکس JPG، PNG یا WebP قابل قبول است."),
      true,
    );
  },
}).single("image");

export async function uploadImage(req, res) {
  if (!req.file) throw new AppError("یک عکس انتخاب کنید.");
  let buffer;
  try {
    const input = sharp(req.file.buffer, {
      limitInputPixels: 25_000_000,
      failOn: "error",
    });
    const info = await input.metadata();
    if (!["jpeg", "png", "webp"].includes(info.format) || (info.pages || 1) > 1)
      throw new Error("Unsupported image");
    buffer = await input
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AppError("فایل عکس معتبر نیست یا ابعاد آن بیش از حد بزرگ است.");
  }
  const directory = uploadsDirectory(),
    filename = `${randomUUID()}.webp`;
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, filename), buffer, { flag: "wx" });
  res
    .status(201)
    .json({ success: true, data: { url: `/api/images/${filename}` } });
}
