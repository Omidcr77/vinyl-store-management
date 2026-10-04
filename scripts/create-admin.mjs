import dotenv from "dotenv";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import database from "../backend/db/mysql.js";
import { connectDB } from "../backend/config/db.js";
import { bootstrapAdmin } from "../backend/services/authService.js";
// Local-only bootstrap. No HTTP registration endpoint or shared default password.
dotenv.config({ path: resolve("backend/.env"), quiet: true });
let file;
try {
  await connectDB(process.env.MYSQL_URL);
  let credentials;
  if (process.argv[2] === "--file" && process.argv[3])
    credentials = JSON.parse(await readFile(resolve(process.argv[3]), "utf8"));
  else {
    credentials = {
      username: "admin",
      name: "مدیر سیستم",
      password: randomBytes(24).toString("base64url"),
    };
    file = resolve(
      ".data",
      `initial-admin-${randomBytes(4).toString("hex")}.txt`,
    );
    await mkdir(resolve(".data"), { recursive: true });
    // Verify output can be written before committing the bootstrap account.
    await writeFile(
      file,
      `Username: ${credentials.username}\nTemporary password: ${credentials.password}\nKeep this password private and delete this file after setup.\n`,
      { flag: "wx", mode: 0o600 },
    );
  }
  await bootstrapAdmin(credentials);
  console.log(
    file
      ? `First admin created. Credentials saved locally: ${file}`
      : "First admin created. Log in with the configured password.",
  );
} catch (error) {
  if (file) await unlink(file).catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await database.disconnect();
}
