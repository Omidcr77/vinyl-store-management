import { useState } from "react";
import { api } from "../services/api";
import { ErrorMessage } from "./UI";
export function Photo({ src, name, large = false }) {
  const [failed, setFailed] = useState("");
  return src && failed !== src ? (
    <img
      className={large ? "record-photo large" : "record-photo"}
      src={src}
      alt={name || "عکس"}
      loading="lazy"
      onError={() => setFailed(src)}
    />
  ) : (
    <span className="avatar light">{name?.slice(0, 1) || "▧"}</span>
  );
}
export default function ImagePicker({ defaultValue = "", onBusy }) {
  const [value, setValue] = useState(defaultValue),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > 5 * 1024 * 1024)
      return setError("حجم عکس نباید بیشتر از ۵ مگابایت باشد.");
    setBusy(true);
    onBusy?.(true);
    try {
      const body = new FormData();
      body.append("image", file);
      const result = await api("/images", { method: "POST", body });
      setValue(result.url);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  return (
    <div className="image-picker full">
      <input type="hidden" name="img" value={value} />
      <label className="field-label">
        عکس (اختیاری)
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={upload}
          disabled={busy}
        />
      </label>
      <small>JPG، PNG یا WebP، حداکثر ۵ مگابایت</small>
      {busy && <p role="status">در حال آپلود عکس…</p>}
      {value && (
        <div>
          <Photo src={value} name="عکس انتخاب‌شده" large />
          <button type="button" disabled={busy} onClick={() => setValue("")}>
            حذف عکس
          </button>
        </div>
      )}
      <ErrorMessage error={error} />
    </div>
  );
}
