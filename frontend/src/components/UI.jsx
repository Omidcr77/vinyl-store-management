import DateInput from "./DateInput";
import { useEffect, useRef, useState } from "react";
import DeleteIcon from "./DeleteIcon";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Download,
  X,
  LoaderCircle,
} from "lucide-react";
import { download } from "../services/api";
import { number, paymentMethod, customerName } from "../utils/format";
import { useAuth } from "../services/auth";
export function PageHeading({
  eyebrow = "دکان شما در یک نگاه",
  title,
  description,
  children,
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function Badge({ value }) {
  return (
    <span className={`badge ${value}`}>
      {{
        "low-stock": "کم‌موجود",
        available: "موجود",
        sold: "تمام‌شده",
        cash: "پرداخت‌شده",
        credit: "قرض",
        partial: "قسمی",
      }[value] || value}
    </span>
  );
}
export function ErrorMessage({ error }) {
  return error ? (
    <div className="error" role="alert">
      {error}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading">
      <LoaderCircle size={20} className="spin" /> در حال دریافت معلومات دکان…
    </div>
  );
}
export function Field({ label, children, hint, ...props }) {
  const labelRef = useRef();
  useEffect(() => {
    labelRef.current
      ?.querySelectorAll("input, select, textarea")
      .forEach((input) => input.setCustomValidity(""));
  }, [props.value]);
  return (
    <label
      ref={labelRef}
      className={`field ${props.className || ""}`}
      onInvalid={(event) => {
        const input = event.target;
        input.setCustomValidity(
          input.validity.valueMissing
            ? "این خانه ضروری است."
            : input.validity.rangeOverflow
              ? `مقدار نباید بیشتر از ${input.max} باشد.`
              : input.validity.rangeUnderflow
                ? `مقدار نباید کمتر از ${input.min} باشد.`
                : "مقدار معتبر وارد کنید.",
        );
      }}
      onInput={(event) => event.target.setCustomValidity?.("")}
    >
      <span>
        {label}
        {props.required && " *"}
      </span>
      {children ||
        (props.type === "date" ? (
          <DateInput aria-label={label} {...props} />
        ) : (
          <input aria-label={label} {...props} />
        ))}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function SummaryCard({ label, value, detail, icon: Icon, accent }) {
  return (
    <div className={`summary-card ${accent ? "accent" : ""}`}>
      <div className="card-label">
        {label}
        {Icon && <Icon size={18} />}
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
export function Table({
  columns,
  rows = [],
  view = "table",
  empty = "موردی یافت نشد. فیلتر را تغییر دهید یا نخستین مورد را ثبت کنید.",
}) {
  const cell = (column, row) =>
    column.render
      ? column.render(row)
      : column.key === "paymentMethod"
        ? paymentMethod(row[column.key])
        : column.key === "customerName"
          ? customerName(row[column.key])
          : (row[column.key] ?? "—");
  if (view !== "table") {
    const title =
      columns.find((c) =>
        ["name", "billNumber", "vinylName"].includes(c.key),
      ) || columns[0];
    const actions = columns.filter((c) => ["actions", "print"].includes(c.key));
    const details = columns.filter((c) => c !== title && !actions.includes(c));
    return rows.length ? (
      <div className={`record-cards record-cards-${view}`}>
        {rows.map((row, i) => (
          <article className="record-card" key={row._id || i}>
            <div className="record-card-title">{cell(title, row)}</div>
            <dl className="record-card-details">
              {details.map((c) => (
                <div key={c.key}>
                  <dt>{c.label}</dt>
                  <dd>{cell(c, row)}</dd>
                </div>
              ))}
            </dl>
            {actions.length > 0 && (
              <div className="record-card-actions">
                {actions.map((c) => (
                  <div key={c.key}>{cell(c, row)}</div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    ) : (
      <div className="empty">{empty}</div>
    );
  }
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row._id || i}>
              {columns.map((c) => (
                <td key={c.key}>
                  {c.render
                    ? c.render(row)
                    : c.key === "paymentMethod"
                      ? paymentMethod(row[c.key])
                      : c.key === "customerName"
                        ? customerName(row[c.key])
                        : (row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <div className="empty">{empty}</div>}
    </div>
  );
}
export function Pagination({ data, onChange }) {
  if (!data) return null;
  return (
    <div className="pagination">
      <span>
        {data.total
          ? `${number((data.page - 1) * data.limit + 1)}–${number(Math.min(data.page * data.limit, data.total))} از ${number(data.total)}`
          : "0 مورد"}
      </span>
      <div>
        <button
          aria-label="صفحهٔ قبلی"
          disabled={data.page <= 1}
          onClick={() => onChange(data.page - 1)}
        >
          <ArrowLeft size={15} />
        </button>
        <span>
          صفحه {number(data.page)} از {number(data.pages)}
        </span>
        <button
          aria-label="صفحهٔ بعدی"
          disabled={data.page >= data.pages}
          onClick={() => onChange(data.page + 1)}
        >
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
export function SearchInput({
  value,
  onChange,
  placeholder = "جستجوی معلومات…",
}) {
  return (
    <div className="search-input">
      <Search size={17} />
      <input
        aria-label="جستجو"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
export function ExportButtons({ kind, params = {} }) {
  const { canManage } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(format) {
    setBusy(true);
    setError("");
    try {
      await download(kind, params, format);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!canManage) return null;
  return (
    <>
      <div className="export-buttons">
        <button disabled={busy} onClick={() => run("csv")}>
          <Download size={15} /> CSV
        </button>
        <button disabled={busy} onClick={() => run("xlsx")}>
          اکسل
        </button>
      </div>
      <ErrorMessage error={error} />
    </>
  );
}
export function Modal({ title, onClose, children, className }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.focus();
  }, []);
  return createPortal(
    <dialog
      className={className}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button aria-label="بستن پنجره" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>,
    document.body,
  );
}
export function ConfirmDialog({
  title,
  message,
  onConfirm,
  onClose,
  confirmLabel = "بایگانی رول",
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      <ErrorMessage error={error} />
      <div className="form-footer">
        <button onClick={onClose}>انصراف</button>
        <button
          className="danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError(e.message);
              setBusy(false);
            }
          }}
        >
          <DeleteIcon /> {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
export function BackLink({ to, children }) {
  return (
    <Link className="back-link" to={to}>
      <ArrowLeft size={19} aria-hidden="true" />
      {children}
    </Link>
  );
}
export function DateFilter({ from, to, onChange }) {
  return (
    <>
      <Field label="از تاریخ">
        <DateInput
          type="date"
          aria-label="از تاریخ"
          value={from || ""}
          onChange={(e) => onChange({ from: e.target.value })}
        />
      </Field>
      <Field label="تا تاریخ">
        <DateInput
          type="date"
          aria-label="تا تاریخ"
          value={to || ""}
          onChange={(e) => onChange({ to: e.target.value })}
        />
      </Field>
    </>
  );
}
