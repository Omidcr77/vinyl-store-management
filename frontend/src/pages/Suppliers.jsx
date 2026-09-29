import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, authFetch, query } from "../services/api";
import { useStore, useResource, useDebounce } from "../services/store";
import {
  PageHeading,
  Field,
  Table,
  Pagination,
  ErrorMessage,
  Loading,
  Modal,
  SearchInput,
  SummaryCard,
  BackLink,
  DateFilter,
} from "../components/UI";
import { formValues, today } from "../utils/format";
import { randomUUID } from "../utils/uuid";
import { supplierKinds } from "../../../shared/suppliers.js";
function SupplierForm({ supplier = {}, onClose }) {
  const { refresh, notice } = useStore();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(supplier._id ? `/suppliers/${supplier._id}` : "/suppliers", {
        method: supplier._id ? "PUT" : "POST",
        body: formValues(e.currentTarget),
      });
      refresh();
      notice("تهیه‌کننده ذخیره شد.");
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={supplier._id ? "ویرایش تهیه‌کننده" : "افزودن تهیه‌کننده"}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={save}>
        <div className="form-grid">
          <Field
            label="نام شرکت / تهیه‌کننده"
            name="name"
            required
            maxLength={200}
            defaultValue={supplier.name}
          />
          <Field
            label="شمارهٔ تماس"
            name="phone"
            maxLength={200}
            defaultValue={supplier.phone}
          />
          <Field
            label="آدرس"
            name="address"
            maxLength={500}
            defaultValue={supplier.address}
          />
          <Field
            label="یادداشت"
            name="notes"
            maxLength={3000}
            defaultValue={supplier.notes}
          />
        </div>
        <ErrorMessage error={error} />
        <div className="form-footer">
          <button type="button" disabled={busy} onClick={onClose}>
            انصراف
          </button>
          <button className="primary" disabled={busy}>
            ذخیرهٔ تهیه‌کننده
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function Suppliers() {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState(null);
  const debounced = useDebounce(search),
    { money } = useStore();
  const { data, error, loading } = useResource(
    `/suppliers?${query({ search: debounced, page, order: "asc" })}`,
  );
  return (
    <>
      <PageHeading
        title="تهیه‌کنندگان"
        description="خرید، پرداخت، پیش‌پرداخت و حساب طلب و قرض شرکت‌ها."
      >
        <button className="primary" onClick={() => setEdit({})}>
          افزودن تهیه‌کننده
        </button>
      </PageHeading>
      <div className="summary-grid">
        <SummaryCard
          label="مجموع قرض ما به تهیه‌کنندگان"
          value={money(data?.summary.payable || 0)}
        />
        <SummaryCard
          label="مجموع طلب ما از تهیه‌کنندگان"
          value={money(data?.summary.receivable || 0)}
        />
      </div>
      <section className="panel">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
        />
        <ErrorMessage error={error} />
        {loading && !data ? (
          <Loading />
        ) : (
          <Table
            rows={data?.items}
            columns={[
              {
                key: "name",
                label: "تهیه‌کننده",
                render: (r) => (
                  <Link className="record-link" to={`/suppliers/${r._id}`}>
                    {r.name}
                  </Link>
                ),
              },
              { key: "phone", label: "شمارهٔ تماس" },
              {
                key: "balance",
                label: "مانده حساب",
                render: (r) =>
                  `${money(Math.abs(r.balance), r.currency)} · ${r.balance > 0 ? "قرض ما" : r.balance < 0 ? "طلب ما" : "تسویه"}`,
              },
              {
                key: "actions",
                label: "عملیات",
                render: (r) => (
                  <div className="row-actions">
                    <Link to={`/suppliers/${r._id}`}>صورت‌حساب</Link>
                    <button onClick={() => setEdit(r)}>ویرایش</button>
                  </div>
                ),
              },
            ]}
          />
        )}
        <Pagination data={data} onChange={setPage} />
      </section>
      {edit && <SupplierForm supplier={edit} onClose={() => setEdit(null)} />}
    </>
  );
}
function EntryForm({ supplier, reverse, onClose }) {
  const { refresh, notice } = useStore();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [attempted, setAttempted] = useState(false);
  const key = useRef(randomUUID());
  async function submit(e) {
    e.preventDefault();
    const body = formValues(e.currentTarget, ["amount"]);
    setBusy(true);
    setError("");
    setAttempted(true);
    try {
      await api(
        `/suppliers/${supplier._id}/entries${reverse ? `/${reverse._id}/reverse` : ""}`,
        { method: "POST", body, headers: { "Idempotency-Key": key.current } },
      );
      refresh();
      notice("معامله در حساب ثبت شد.");
      onClose();
    } catch (e) {
      setError(e.message);
      if (e.status >= 400 && e.status < 500 && e.status !== 409)
        setAttempted(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={reverse ? "لغو معامله" : "ثبت معاملهٔ تهیه‌کننده"}
      onClose={() => !busy && onClose()}
    >
      <form onSubmit={submit}>
        <p>
          {supplier.name} · تمام مبالغ به {supplier.currency}. پرداخت به
          تهیه‌کننده، قرض ما را کم می‌کند و می‌تواند به پیش‌پرداخت یا طلب ما
          تبدیل شود.
        </p>
        {reverse && (
          <p>اصل معامله محفوظ می‌ماند و مبلغ آن با یک ثبت معکوس خنثی می‌شود.</p>
        )}
        <div
          className="form-grid"
          style={attempted ? { pointerEvents: "none" } : undefined}
        >
          {!reverse && (
            <>
              <Field label="نوع معامله">
                <select
                  aria-label="نوع معامله"
                  name="kind"
                  defaultValue="payment"
                >
                  {Object.entries(supplierKinds)
                    .filter(([k]) => !["purchase", "reversal"].includes(k))
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label="مبلغ"
                name="amount"
                type="number"
                min="0.01"
                max="100000000"
                step="0.01"
                required
              />
              <Field
                label="تاریخ معامله"
                name="date"
                type="date"
                defaultValue={today()}
                required
              />
              <Field label="روش پرداخت">
                <select aria-label="روش پرداخت" name="paymentMethod">
                  <option value="cash">نقد</option>
                  <option value="bank">بانک</option>
                  <option value="other">سایر</option>
                </select>
              </Field>
              <Field
                label="شمارهٔ مرجع / رسید"
                name="reference"
                maxLength={200}
              />
            </>
          )}
          <Field
            label="توضیح معامله"
            name="details"
            required
            maxLength={3000}
          />
        </div>
        <ErrorMessage error={error} />
        <div className="form-footer">
          <button type="button" disabled={busy} onClick={onClose}>
            انصراف
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "در حال ثبت…" : "ثبت در حساب"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function SupplierDetail() {
  const { id } = useParams(),
    { money, date } = useStore();
  const [page, setPage] = useState(1),
    [range, setRange] = useState({}),
    [entry, setEntry] = useState(null),
    [edit, setEdit] = useState(false),
    [error, setError] = useState("");
  const {
    data,
    error: loadError,
    loading,
  } = useResource(`/suppliers/${id}?${query({ ...range, page })}`);
  async function download(format) {
    try {
      const response = await authFetch(
        `/api/suppliers/${id}/statement?format=${format}`,
      );
      if (!response.ok) throw new Error("دریافت صورت‌حساب انجام نشد.");
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `supplier-${id}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    }
  }
  if (!data)
    return (
      <>
        <ErrorMessage error={loadError} />
        {loading && <Loading />}
      </>
    );
  const { supplier, entries } = data;
  return (
    <>
      <BackLink to="/suppliers">برگشت به تهیه‌کنندگان</BackLink>
      <PageHeading
        title={supplier.name}
        description={`${supplier.phone} · ${supplier.address}`}
      >
        <button onClick={() => setEdit(true)}>ویرایش تهیه‌کننده</button>
        <button onClick={() => download("csv")}>دانلود صورت‌حساب CSV</button>
        <button onClick={() => download("pdf")}>صورت‌حساب PDF</button>
        <button className="primary" onClick={() => setEntry({})}>
          ثبت معامله
        </button>
      </PageHeading>
      <div className="summary-grid">
        <SummaryCard
          label={
            supplier.balance >= 0
              ? "قرض ما به تهیه‌کننده"
              : "طلب ما از تهیه‌کننده"
          }
          value={money(Math.abs(supplier.balance), supplier.currency)}
        />
      </div>
      <p className="muted">
        مانده مثبت = قرض ما؛ مانده منفی = طلب ما. مانده پس از ثبت، ترتیب ثبت
        معاملات را نشان می‌دهد. فایل صورت‌حساب شامل تمام معاملات است.
      </p>
      <section className="panel">
        <DateFilter
          {...range}
          onChange={(v) => {
            setRange((r) => ({ ...r, ...v }));
            setPage(1);
          }}
        />
        <ErrorMessage error={error || loadError} />
        <Table
          rows={entries.items}
          columns={[
            { key: "date", label: "تاریخ", render: (r) => date(r.date) },
            {
              key: "kind",
              label: "معامله",
              render: (r) => (
                <>
                  {supplierKinds[r.kind]}
                  {r.reversed && (
                    <small className="cell-sub">لغو شده با ثبت معکوس</small>
                  )}
                </>
              ),
            },
            { key: "reference", label: "مرجع" },
            {
              key: "amount",
              label: "مبلغ",
              render: (r) =>
                `${money(r.amount, r.currency)} · ${r.deltaMinor > 0 ? "افزایش قرض ما" : "کاهش قرض / افزایش طلب ما"}`,
            },
            {
              key: "balanceAfter",
              label: "مانده پس از ثبت",
              render: (r) => money(r.balanceAfter, r.currency),
            },
            { key: "details", label: "توضیحات" },
            {
              key: "actions",
              label: "عملیات",
              render: (r) =>
                !r.reversed &&
                !r.deliveryId &&
                !r.vinylId &&
                !["purchase", "reversal"].includes(r.kind) && (
                  <button onClick={() => setEntry(r)}>لغو معامله</button>
                ),
            },
          ]}
        />
        <Pagination data={entries} onChange={setPage} />
      </section>
      {entry && (
        <EntryForm
          supplier={supplier}
          reverse={entry._id ? entry : null}
          onClose={() => setEntry(null)}
        />
      )}
      {edit && (
        <SupplierForm supplier={supplier} onClose={() => setEdit(false)} />
      )}
    </>
  );
}
