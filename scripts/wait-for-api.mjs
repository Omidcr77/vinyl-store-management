import { setTimeout as delay } from "node:timers/promises";

export async function waitForApi(
  target,
  { timeoutMs = 60000, intervalMs = 300 } = {},
) {
  const healthUrl = new URL(
    "api/health",
    target.endsWith("/") ? target : `${target}/`,
  );
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl, {
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(1500, deadline - Date.now())),
        ),
      });
      const body = await response.json();
      if (response.ok && body.success === true && body.data?.status === "ok")
        return;
    } catch {
      // Startup can temporarily refuse connections while MySQL connects.
    }
    await delay(Math.max(0, Math.min(intervalMs, deadline - Date.now())));
  }
  throw new Error(
    `API is not ready at ${healthUrl}. Start MySQL with npm run db, then run npm run dev. If using a different API address, set VITE_API_TARGET to match it.`,
  );
}
