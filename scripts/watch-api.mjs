import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

// Windows directory notifications from dependency/build activity can repeatedly
// restart Node's default dependency watcher. Watch only application sources.
const paths = [
  "server.js",
  "app.js",
  "controllers",
  "models",
  "routes",
  "services",
  "middleware",
  "config",
  "utils",
  "../shared",
];
const watch = ["win32", "darwin"].includes(process.platform)
  ? paths.map((path) => `--watch-path=${path}`)
  : ["--watch"];
const child = spawn(process.execPath, [...watch, "server.js"], {
  cwd: fileURLToPath(new URL("../backend/", import.meta.url)),
  stdio: "inherit",
  windowsHide: true,
});
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code || 0;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
