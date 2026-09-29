import { useState } from "react";
import { api, query } from "../services/api";
import { useResource, useStore } from "../services/store";
import { roleLabels } from "../services/auth";
import {
  PageHeading,
  Table,
  Pagination,
  Modal,
  Field,
  ErrorMessage,
  Loading,
} from "../components/UI";
export default function Users() {
  const [page, setPage] = useState(1),
    [edit, setEdit] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const {
      data,
      loading,
      error: loadError,
    } = useResource(`/users?${query({ page })}`),
    { refresh, notice, date } = useStore();
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget),
      body = Object.fromEntries(f);
    if (!body.password) delete body.password;
    if (edit._id) body.active = f.get("active") === "true";
    try {
      await api(`/users${edit._id ? "/" + edit._id : ""}`, {
        method: edit._id ? "PUT" : "POST",
        body,
      });
      setEdit(null);
      refresh();
      notice("حساب کاربر ذخیره شد.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="مدیریت کاربران"
        description="فقط مدیر سیستم می‌تواند حساب‌ها و نقش‌ها را مدیریت کند."
      >
        <button
          className="primary"
          onClick={() => {
            setEdit({ role: "staff", active: true });
            setError("");
          }}
        >
          افزودن کاربر
        </button>
      </PageHeading>
      <ErrorMessage error={loadError} />
      {loading && !data ? (
        <Loading />
      ) : (
        <section className="panel">
          <Table
            rows={data?.items}
            columns={[
              { key: "name", label: "نام" },
              { key: "username", label: "نام کاربری" },
              { key: "role", label: "نقش", render: (r) => roleLabels[r.role] },
              {
                key: "active",
                label: "وضعیت",
                render: (r) => (r.active ? "فعال" : "غیرفعال"),
              },
              {
                key: "lastLoginAt",
                label: "آخرین ورود",
                render: (r) => date(r.lastLoginAt),
              },
              {
                key: "actions",
                label: "عملیات",
                render: (r) => (
                  <button
                    onClick={() => {
                      setEdit(r);
                      setError("");
                    }}
                  >
                    ویرایش حساب
                  </button>
                ),
              },
            ]}
          />
          <Pagination data={data} onChange={setPage} />
        </section>
      )}
      {edit && (
        <Modal
          title={edit._id ? "ویرایش کاربر" : "افزودن کاربر"}
          onClose={() => !busy && setEdit(null)}
        >
          <form onSubmit={save}>
            <div className="form-grid">
              <Field
                label="نام کامل"
                name="name"
                required
                maxLength={100}
                defaultValue={edit.name}
              />
              <Field
                label="نام کاربری"
                name="username"
                required
                minLength={3}
                maxLength={40}
                dir="ltr"
                defaultValue={edit.username}
                hint="3 تا 40 حرف انگلیسی، عدد، نقطه، خط تیره یا زیرخط"
              />
              <Field label="نقش">
                <select aria-label="نقش" name="role" defaultValue={edit.role}>
                  {Object.entries(roleLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              {edit._id && (
                <Field label="وضعیت حساب">
                  <select
                    name="active"
                    aria-label="وضعیت حساب"
                    defaultValue={String(edit.active)}
                  >
                    <option value="true">فعال</option>
                    <option value="false">غیرفعال</option>
                  </select>
                </Field>
              )}
              <Field
                label={edit._id ? "رمز جدید (اختیاری)" : "رمز عبور"}
                name="password"
                type="password"
                required={!edit._id}
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                hint="کاربر با همین رمز مستقیماً وارد حساب می‌شود."
              />
            </div>
            <p className="small muted">
              پس از ویرایش حساب، نشست‌های قبلی کاربر بسته می‌شوند. حساب غیرفعال،
              سابقهٔ معاملات را حفظ می‌کند.
            </p>
            <ErrorMessage error={error} />
            <div className="form-footer">
              <button
                type="button"
                disabled={busy}
                onClick={() => setEdit(null)}
              >
                انصراف
              </button>
              <button className="primary" disabled={busy}>
                ذخیرهٔ کاربر
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
