import { useStore } from "../services/store";
import { useState } from "react";
import { useAuth } from "../services/auth";
import { api, authFetch } from "../services/api";
import { ErrorMessage, Modal } from "./UI";
const labels = {
  settings: "تنظیمات",
  vinylrolls: "رول‌های موجودی",
  customers: "مشتریان",
  sales: "فروشات",
  payments: "رسیدها",
  counters: "شماره‌گذاری",
  customerprices: "نرخ‌های مشتریان",
  deliveries: "محموله‌ها",
  users: "کاربران",
  auditevents: "تاریخچهٔ فعالیت‌ها",
  authguards: "تنظیمات حساب‌ها",
  deletedrecords: "سوابق حذف‌شده",
};
export default function BackupSettings() {
  const { isAdmin, clear } = useAuth();
  const { date } = useStore();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [file, setFile] = useState(null),
    [preview, setPreview] = useState(null),
    [confirm, setConfirm] = useState(false),
    [accepted, setAccepted] = useState(false),
    [recoveries, setRecoveries] = useState(null),
    [message, setMessage] = useState("");
  if (!isAdmin) return null;
  async function download(path, name) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await authFetch(path);
      if (!response.ok)
        throw new Error(
          (await response.json()).error?.message || "دریافت بکاپ انجام نشد.",
        );
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("فایل بکاپ دانلود شد. آن را در جای امن نگه دارید.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect() {
    setBusy(true);
    setError("");
    setPreview(null);
    setMessage("");
    try {
      const body = new FormData();
      body.append("backup", file);
      setPreview(await api("/backup/preview", { method: "POST", body }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("backup", file);
      body.append("digest", preview.digest);
      body.append("confirmation", "RESTORE");
      await api("/backup/restore", { method: "POST", body });
      sessionStorage.setItem("backup-restored", "true");
      clear();
      window.location.assign("/login?restored=1");
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <section className="panel form-panel section-gap" aria-label="بکاپ کامل">
      <h2>بکاپ کامل و بازیابی</h2>
      <p>
        تمام معلومات دکان، مشتریان، موجودی، فروشات، رسیدها، کاربران، رمزهای
        ذخیره‌شده، عکس‌ها و تاریخچهٔ فعالیت‌ها در یک فایل ذخیره می‌شود.
      </p>
      <p className="small muted">
        این فایل معلومات خصوصی و حساب‌های کاربران را دارد؛ آن را در جای امن نگه
        دارید. پس از بازیابی، همه باید با حساب و رمز موجود در بکاپ دوباره وارد
        شوند.
      </p>
      <button
        disabled={busy}
        onClick={() =>
          download(
            "/api/backup/export",
            `store-${new Date().toISOString().slice(0, 10)}.vinyl-backup.gz`,
          )
        }
      >
        دانلود بکاپ کامل
      </button>
      <hr />
      <label className="field">
        <span>انتخاب فایل بکاپ</span>
        <input
          aria-label="انتخاب فایل بکاپ"
          type="file"
          accept=".gz,.vinyl-backup.gz"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setPreview(null);
            setError("");
            setAccepted(false);
          }}
        />
        <small>حداکثر حجم فایل: 100 MB؛ حجم بازشده: 256 MB.</small>
      </label>
      <button disabled={busy || !file} onClick={inspect}>
        بررسی فایل بکاپ
      </button>
      {preview && (
        <div className="section-gap">
          <h3>محتوای بکاپ: {preview.storeName}</h3>
          <p>
            تاریخ بکاپ:{" "}
            {date(preview.createdAt, { hour: "2-digit", minute: "2-digit" })}
          </p>
          <dl className="detail-grid">
            {Object.entries(preview.counts).map(([key, count]) => (
              <div key={key}>
                <dt>{labels[key] || key}</dt>
                <dd>{count}</dd>
              </div>
            ))}
            <div>
              <dt>عکس‌ها</dt>
              <dd>{preview.photos}</dd>
            </div>
          </dl>
          <button
            className="danger"
            disabled={busy}
            onClick={() => {
              setAccepted(false);
              setConfirm(true);
            }}
          >
            بازیابی این بکاپ
          </button>
        </div>
      )}
      <ErrorMessage error={!confirm ? error : ""} />
      {busy && (
        <p role="status">در حال انجام عملیات… لطفاً این صفحه را نبندید.</p>
      )}
      {message && <p role="status">{message}</p>}
      <hr />
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setRecoveries(await api("/backup/recovery"));
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        نمایش بکاپ‌های پیش از بازیابی
      </button>
      {recoveries &&
        (recoveries.length ? (
          <ul>
            {recoveries.map((item) => (
              <li key={item.name}>
                <button
                  disabled={busy}
                  onClick={() =>
                    download(`/api/backup/recovery/${item.name}`, item.name)
                  }
                >
                  دانلود بکاپ پیشین —{" "}
                  {date(item.createdAt, { hour: "2-digit", minute: "2-digit" })}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>هنوز بکاپ پیش از بازیابی موجود نیست.</p>
        ))}
      {confirm && (
        <Modal
          title="جایگزینی تمام معلومات دکان؟"
          onClose={() => {
            if (!busy) setConfirm(false);
          }}
        >
          <p>
            تمام سوابق و کاربران فعلی با محتوای این بکاپ جایگزین می‌شوند. نخست
            یک بکاپ ایمنی از وضعیت فعلی ذخیره می‌شود. نشست‌های ورود بسته
            می‌شوند؛ رمز یک مدیر سیستم در بکاپ را باید بدانید.
          </p>
          <label className="bulk-actions">
            <input
              type="checkbox"
              checked={accepted}
              disabled={busy}
              onChange={(e) => setAccepted(e.target.checked)}
            />{" "}
            جایگزینی تمام معلومات و کاربران را تأیید می‌کنم.
          </label>
          <ErrorMessage error={error} />
          <div className="form-footer">
            <button disabled={busy} onClick={() => setConfirm(false)}>
              انصراف
            </button>
            <button
              className="danger"
              disabled={busy || !accepted}
              onClick={restore}
            >
              تأیید بازیابی کامل
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
