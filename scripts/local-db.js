import { startMysql } from "./mysql-server.mjs";
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
