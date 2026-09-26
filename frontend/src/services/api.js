export const query = (params) =>
  new URLSearchParams(
    Object.entries(params).filter(
      ([, v]) => v !== "" && v !== undefined && v !== null,
    ),
  ).toString();
export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch("/api" + path, {
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
    throw new Error(
      "ارتباط با سرور دکان برقرار نشد. فعال بودن سرور را بررسی کنید.",
    );
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success)
    throw new Error(
      result?.error?.message || "سرور نتوانست این درخواست را تکمیل کند.",
    );
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
  const res = await fetch(
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
