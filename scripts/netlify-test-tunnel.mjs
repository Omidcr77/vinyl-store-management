// Keep a test Netlify site's proxy rules aligned with a supervised Quick Tunnel.
// All account credentials and site state are private local files, never build assets.
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
const run = promisify(execFile);
const binary = process.env.CLOUDFLARED_BIN;
const cli = process.env.NETLIFY_CLI_SCRIPT;
if (!binary || !cli)
  throw new Error(
    "Set CLOUDFLARED_BIN and NETLIFY_CLI_SCRIPT to installed local executables.",
  );
const tokenFile = resolve(".data/netlify-token");
await chmod(tokenFile, 0o600);
const token = (await readFile(tokenFile, "utf8")).trim();
const site = JSON.parse(await readFile(".data/netlify-site.json", "utf8"));
if (!token || !site.id)
  throw new Error(
    "Configure the private Netlify token and account-owned site first.",
  );
let stopping = false,
  started = false,
  buffer = "";
const child = spawn(
  binary,
  [
    "tunnel",
    "--url",
    "http://127.0.0.1:5105",
    "--protocol",
    "http2",
    "--no-autoupdate",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
async function deploy(backend) {
  console.log("New HTTPS test tunnel allocated; waiting for API health.");
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(backend + "/api/health", {
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok && (await r.json()).data?.status === "ok") {
        ready = true;
        break;
      }
    } catch {}
    await delay(1000);
  }
  if (!ready) throw new Error("Test tunnel did not become healthy.");
  const env = {
    ...process.env,
    NETLIFY_AUTH_TOKEN: token,
    PUBLIC_BACKEND_URL: backend,
  };
  // The build includes only the public backend URL, never the account token.
  const buildEnv = { ...process.env, PUBLIC_BACKEND_URL: backend };
  delete buildEnv.NETLIFY_AUTH_TOKEN;
  const build = await run("npm", ["run", "build:netlify"], {
    cwd: root,
    env: buildEnv,
    maxBuffer: 4 * 1024 * 1024,
  });
  await run(
    process.execPath,
    [
      cli,
      "env:set",
      "PUBLIC_BACKEND_URL",
      backend,
      "--filter",
      "vinyl-frontend",
      "--site",
      site.id,
      "--context",
      "production",
      "--force",
    ],
    { cwd: root, env, maxBuffer: 1024 * 1024 },
  );
  const result = await run(
    process.execPath,
    [
      cli,
      "deploy",
      "--filter",
      "vinyl-frontend",
      "--site",
      site.id,
      "--dir",
      resolve("frontend/dist"),
      "--no-build",
      "--prod",
      "--json",
    ],
    { cwd: root, env, maxBuffer: 4 * 1024 * 1024 },
  );
  const deployed = JSON.parse(result.stdout);
  await writeFile(
    resolve(".data/netlify-tunnel-state.json"),
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        backend,
        siteId: site.id,
        siteUrl: site.url,
        deployId: deployed.deploy_id,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await writeFile(
    resolve(".data/netlify-last-deploy.log"),
    build.stdout + build.stderr + result.stdout + result.stderr,
    { mode: 0o600 },
  );
  console.log(`Netlify proxy updated and published: ${site.url}`);
}
function output(chunk) {
  const text = chunk.toString();
  buffer = (buffer + text).slice(-12000);
  const url = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0];
  if (url && !started) {
    started = true;
    deploy(url).catch(async (error) => {
      await writeFile(
        resolve(".data/netlify-tunnel-error.log"),
        String(error.stack || error),
        { mode: 0o600 },
      ).catch(() => {});
      console.error(
        "Netlify tunnel publication failed; details saved privately in .data/netlify-tunnel-error.log.",
      );
      child.kill("SIGTERM");
      process.exit(1);
    });
  }
}
child.stdout.on("data", output);
child.stderr.on("data", output);
child.once("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
child.once("exit", () => {
  if (!stopping) {
    console.error(
      "HTTPS test tunnel stopped; supervisor will reconnect and republish.",
    );
    process.exit(1);
  }
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    child.kill("SIGTERM");
    process.exit(0);
  });
