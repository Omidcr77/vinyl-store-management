import { createServer } from "vite";
import { resolve } from "node:path";
import { privateFilePatterns } from "../../frontend/vite-security.js";
const server = await createServer({
  configFile: false,
  root: resolve("frontend"),
  logLevel: "silent",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: "127.0.0.1", port: 0, fs: { deny: privateFilePatterns } },
});
await server.listen();
console.log(`http://127.0.0.1:${server.httpServer.address().port}`);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
