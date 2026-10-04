// Local user-owned MariaDB provisioning; app driver/schema also support MySQL 8.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { userInfo } from "node:os";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { mysqlDirectory, mysqlSocket, startMysql } from "./mysql-server.mjs";
const exec = promisify(execFile),
  root = fileURLToPath(new URL("../", import.meta.url));
const envPath = resolve(root, "backend/.env");
let child;
try {
  await mkdir(mysqlDirectory, { recursive: true, mode: 0o700 });
  if (!existsSync(resolve(mysqlDirectory, "mysql")))
    await exec("mariadb-install-db", [
      "--no-defaults",
      `--datadir=${mysqlDirectory}`,
      "--auth-root-authentication-method=socket",
      `--auth-root-socket-user=${userInfo().username}`,
    ]);
  if (!existsSync(mysqlSocket)) {
    child = startMysql();
    await new Promise((r, j) => {
      child.once("spawn", r);
      child.once("error", j);
    });
  }
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await exec("mariadb", [
        "--no-defaults",
        `--socket=${mysqlSocket}`,
        `--user=${userInfo().username}`,
        "-e",
        "SELECT 1",
      ]);
      ready = true;
      break;
    } catch {
      await delay(200);
    }
  }
  if (!ready)
    throw new Error(
      `Local MySQL did not start. Check ${mysqlDirectory}/server.log`,
    );
  let env = existsSync(envPath) ? await readFile(envPath, "utf8") : "";
  const configured = env.match(/^MYSQL_URL=(.*)$/m)?.[1];
  if (!configured || configured.includes("CHANGE_ME")) {
    const password = randomBytes(24).toString("hex"),
      testPassword = randomBytes(24).toString("hex");
    await exec("mariadb", [
      "--no-defaults",
      `--socket=${mysqlSocket}`,
      `--user=${userInfo().username}`,
      "-e",
      `CREATE DATABASE IF NOT EXISTS vinyl_store CHARACTER SET utf8mb4 COLLATE utf8mb4_bin; CREATE USER IF NOT EXISTS 'vinyl_app'@'127.0.0.1' IDENTIFIED BY '${password}'; ALTER USER 'vinyl_app'@'127.0.0.1' IDENTIFIED BY '${password}'; GRANT ALL PRIVILEGES ON vinyl_store.* TO 'vinyl_app'@'127.0.0.1'; CREATE USER IF NOT EXISTS 'vinyl_tests'@'127.0.0.1' IDENTIFIED BY '${testPassword}'; ALTER USER 'vinyl_tests'@'127.0.0.1' IDENTIFIED BY '${testPassword}'; GRANT ALL PRIVILEGES ON \`vinyl\\_test\\_%\`.* TO 'vinyl_tests'@'127.0.0.1';`,
    ]);
    env = env
      .replace(/^MYSQL_URL=.*\n?/gm, "")
      .replace(/^TEST_MYSQL_URL=.*\n?/gm, "");
    env += `\nMYSQL_URL=mysql://vinyl_app:${password}@127.0.0.1:3306/vinyl_store\nTEST_MYSQL_URL=mysql://vinyl_tests:${testPassword}@127.0.0.1:3306\n`;
    await writeFile(envPath, env, { mode: 0o600 });
  }
  console.log(
    "Local MySQL-compatible database initialized. Private app/test credentials saved in backend/.env.",
  );
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}
