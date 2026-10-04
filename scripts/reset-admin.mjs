import dotenv from "dotenv";
import { resolve } from "node:path";
import database from "../backend/db/mysql.js";
import { connectDB } from "../backend/config/db.js";
import User from "../backend/models/User.js";
import LoginSession from "../backend/models/LoginSession.js";
import { hashPassword, lockUsers } from "../backend/services/authService.js";
import { audit } from "../backend/services/actor.js";
dotenv.config({ path: resolve("backend/.env"), quiet: true });
try {
  // Read stdin so passwords never appear in process arguments or source code.
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    if (process.stdin.isTTY)
      throw new Error(
        "Supply ADMIN_PASSWORD privately or pipe a password on stdin.",
      );
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    password = Buffer.concat(chunks)
      .toString("utf8")
      .replace(/\r?\n$/, "");
  }
  const passwordHash = await hashPassword(password);
  await connectDB();
  await database.connection.transaction(async (session) => {
    await lockUsers(session);
    const user = await User.findOne({
      username: process.env.ADMIN_USERNAME || "admin",
      role: "admin",
    }).session(session);
    if (!user)
      throw new Error(
        "Administrator not found. Use admin:create for a fresh store.",
      );
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash, active: true }, $inc: { authVersion: 1 } },
      { session },
    );
    await LoginSession.deleteMany({ userId: user._id }, { session });
    await audit(
      "user.password_reset",
      user._id,
      session,
      "Local administrator recovery",
      user,
    );
  });
  console.log("Admin password updated; previous sessions revoked.");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await database.disconnect();
}
