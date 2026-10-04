import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
export const mysqlDirectory = resolve(root, ".data/mysql");
export const mysqlSocket = resolve(mysqlDirectory, "mysql.sock");
export function startMysql() {
  if (!existsSync(resolve(mysqlDirectory, "mysql")))
    throw new Error(
      "Run npm run db:setup to initialize the local MySQL-compatible server first.",
    );
  return spawn(
    process.env.MYSQL_SERVER_BINARY || "/usr/sbin/mariadbd",
    [
      "--no-defaults",
      `--datadir=${mysqlDirectory}`,
      `--socket=${mysqlSocket}`,
      `--pid-file=${mysqlDirectory}/mysql.pid`,
      `--log-error=${mysqlDirectory}/server.log`,
      "--bind-address=127.0.0.1",
      `--port=${process.env.MYSQL_LOCAL_PORT || 3306}`,
      "--character-set-server=utf8mb4",
      "--collation-server=utf8mb4_bin",
      "--innodb-flush-log-at-trx-commit=1",
    ],
    { stdio: "inherit" },
  );
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const child = startMysql();
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = signal ? 0 : code;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill("SIGTERM"));
}
