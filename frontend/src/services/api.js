let csrfToken = "";
export const setCsrfToken = (token) => {
  csrfToken = token || "";
};
export async function authFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "X-Requested-With": "store-app",
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401 && !url.endsWith("/auth/login"))
    window.dispatchEvent(new Event("auth:unauthorized"));
  return response;
}
export const query = (params) =>
  new URLSearchParams(
    Object.entries(params).filter(
      ([, v]) => v !== "" && v !== undefined && v !== null,
    ),
  ).toString();
export async function api(path, options = {}) {
  let response;
  try {
    response = await authFetch("/api" + path, {
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...options.headers,
      },
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body),
    });
  } catch {
    const error = new Error(
      "ارتباط با سرور دکان برقرار نشد. فعال بودن سرور را بررسی کنید.",
    );
    error.status = 0;
    throw error;
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    const error = new Error(
      result?.error?.message || "سرور نتوانست این درخواست را تکمیل کند.",
    );
    error.status = response.status;
    throw error;
  }
  return result.data;
}
export async function allRecords(path, params = {}) {
  let items = [],
    page = 1,
    result;
  do {
    result = await api(`${path}?${query({ ...params, page, limit: 100 })}`);
    items.push(...result.items);
    page++;
  } while (page <= result.pages);
  return items;
}
export async function download(kind, params, format) {
  const res = await authFetch(
    `/api/exports/${kind}?${query({ ...params, format })}`,
  );
  if (!res.ok) throw new Error("دریافت فایل انجام نشد. دوباره کوشش کنید.");
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `${kind}.${format}`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
