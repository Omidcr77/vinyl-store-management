import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export const uploadsDirectory = () =>
  process.env.UPLOAD_DIR
    ? resolve(process.env.UPLOAD_DIR)
    : fileURLToPath(new URL("../../.data/uploads", import.meta.url));
