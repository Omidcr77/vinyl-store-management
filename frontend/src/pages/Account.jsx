import { useState } from "react";
import { useAuth, roleLabels } from "../services/auth";
import { api } from "../services/api";
export default function Account({ forced = false }) {
  const { user, clear, logout, reload } = useAuth();
  const [profileName, setProfileName] = useState(user.name);
  const [profileMessage, setProfileMessage] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [defaultView, setDefaultView] = useState(() => {
    try {
      return localStorage.getItem(`store:default-view:${user._id}`) || "table";
    } catch {
      return "table";
    }
  });
  async function saveProfile(e) {
    e.preventDefault();
    setProfileBusy(true);
    setProfileError("");
    setProfileMessage("");
    try {
      await api("/auth/profile", {
        method: "PUT",
        body: { name: profileName },
      });
      await reload();
      setProfileMessage("پروفایل ذخیره شد.");
    } catch (e) {
      setProfileError(e.message);
    } finally {
      setProfileBusy(false);
    }
  }
  function changeView(value) {
    setDefaultView(value);
    try {
      localStorage.setItem(`store:default-view:${user._id}`, value);
      for (const page of ["inventory", "sales", "customers"])
        localStorage.removeItem(`store:record-view:${user._id}:${page}`);
      setProfileMessage("نمایش پیش‌فرض در این دستگاه ذخیره شد.");
    } catch {
      setProfileError("ذخیرهٔ ترجیحات در این مرورگر ممکن نیست.");
    }
  }
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm"))
      return setError("تکرار رمز با رمز جدید یکسان نیست.");
    setBusy(true);
    try {
      await api("/auth/password", {
        method: "POST",
        body: {
          currentPassword: f.get("currentPassword"),
          password: f.get("password"),
        },
      });
      clear();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={forced ? "login-page" : "account-page"}>
      {!forced && (
        <div className="profile-panel panel">
          <div className="profile-heading">
            <span className="profile-avatar">{user.name.slice(0, 1)}</span>
            <div>
              <h1>حساب من</h1>
              <p>
                {roleLabels[user.role]} · <bdi dir="ltr">@{user.username}</bdi>
              </p>
            </div>
          </div>
          <form onSubmit={saveProfile}>
            <label className="field">
              <span>نام نمایشی</span>
              <input
                aria-label="نام نمایشی"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                required
                maxLength={100}
                autoComplete="name"
              />
            </label>
            <p className="muted">
              نام کاربری و نقش حساب توسط مدیر سیستم تعیین می‌شود. سوابق قبلی نام
              ثبت‌شدهٔ خود را نگه می‌دارند.
            </p>
            <button className="primary" disabled={profileBusy}>
              {profileBusy ? "در حال ذخیره…" : "ذخیرهٔ پروفایل"}
            </button>
          </form>
          <label className="field">
            <span>نمایش پیش‌فرض رکوردها</span>
            <select
              aria-label="نمایش پیش‌فرض رکوردها"
              value={defaultView}
              onChange={(e) => changeView(e.target.value)}
            >
              <option value="table">جدول</option>
              <option value="grid">شبکه‌ای</option>
              <option value="rows">ردیفی</option>
            </select>
            <small>
              برای این حساب در همین دستگاه؛ جزئیات موبایل با دکمهٔ «جزئیات
              بیشتر» باز می‌شود.
            </small>
          </label>
          {profileMessage && (
            <p role="status" className="profile-success">
              {profileMessage}
            </p>
          )}
          {profileError && (
            <p role="alert" className="error">
              {profileError}
            </p>
          )}
        </div>
      )}
      <details className="account-security" open={forced || undefined}>
        <summary>امنیت و تغییر رمز عبور</summary>
        <div className="login-card">
          <h1>تغییر رمز عبور</h1>
          <p>
            {user.name} · {roleLabels[user.role]}
          </p>
          <p>
            {forced
              ? "برای شروع، رمز موقت خود را تغییر دهید."
              : "پس از تغییر رمز، دوباره وارد شوید."}
          </p>
          <form onSubmit={submit}>
            <label className="field">
              <span>رمز فعلی</span>
              <input
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
                maxLength={128}
              />
            </label>
            <label className="field">
              <span>رمز جدید</span>
              <input
                aria-label="رمز جدید"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
              />
              <small>حداقل 12 حرف</small>
            </label>
            <label className="field">
              <span>تکرار رمز جدید</span>
              <input
                name="confirm"
                type="password"
                required
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
              />
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary wide" disabled={busy}>
              ذخیرهٔ رمز جدید
            </button>
          </form>
          {forced && (
            <button onClick={() => logout().catch((e) => setError(e.message))}>
              خروج
            </button>
          )}
        </div>
      </details>
    </section>
  );
}
