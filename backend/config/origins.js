// Exact browser origins shared by REST and Socket.IO; never accept wildcard origins.
export function allowedOrigins() {
  const values = [
    process.env.CLIENT_URL || "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...(process.env.CLIENT_URLS || "").split(","),
  ];
  return [
    ...new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => {
          const url = new URL(value);
          if (
            !["http:", "https:"].includes(url.protocol) ||
            url.hostname.includes("*") ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            url.pathname !== "/"
          )
            throw new Error(
              "CLIENT_URL and CLIENT_URLS must contain exact HTTP(S) origins without paths or credentials.",
            );
          return url.origin;
        }),
    ),
  ];
}
