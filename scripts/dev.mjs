import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { concurrently } from "concurrently";
import {
  ensureDatabase,
  defaultMongoUri,
  portIsOpen,
} from "./dev-database.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
dotenv.config({ path: resolve(root, "backend/.env"), quiet: true });
let database,
  stopping = false;
const stop = () => {
  stopping = true;
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  const apiPort = Number(process.env.PORT || 5000);
  for (const port of [apiPort, 5173]) {
    if (await portIsOpen(port))
      throw new Error(
        `Port ${port} is already in use. Close the previous store server before running npm run dev again.`,
      );
  }
  database = await ensureDatabase(process.env.MONGO_URI || defaultMongoUri);
  if (!stopping) {
    process.env.VITE_API_TARGET ||= `http://127.0.0.1:${apiPort}`;
    const run = concurrently(
      [
        { name: "api", command: "npm run dev -w backend", cwd: root },
        {
          name: "web",
          command: "npm run dev -w frontend -- --port 5173 --strictPort",
          cwd: root,
        },
      ],
      { killOthersOn: ["success", "failure"], killTimeout: 5000 },
    );
    await run.result;
  }
} catch (error) {
  if (!stopping) {
    console.error(
      error instanceof Error
        ? error.message
        : "A store service stopped. See the error above.",
    );
    process.exitCode = 1;
  }
} finally {
  if (database) await database.stop({ doCleanup: false });
}
