import { useEffect, useState, useCallback } from "react";
import { Trash2 } from "lucide-react";
import Decimal from "decimal.js";
import Lookup from "./Lookup";
import { Field, ErrorMessage } from "./UI";
import { api, query } from "../services/api";
import { useStore } from "../services/store";
import { number } from "../utils/format";

export function lineTotal(line) {
  return new Decimal(line.length || 0)
    .times(line.method === "area" ? line.roll?.width || 0 : 1)
    .times(line.price || 0)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();
}
export default function SaleLine({
  value,
  index,
  customer,
  onChange,
  onRemove,
  removable,
  available,
  excludedIds,
}) {
  const { money } = useStore();
  const { roll, length, method, price, rememberPrice, pricingLoading } = value;
  const [source, setSource] = useState(""),
    [error, setError] = useState("");
  const patch = useCallback(
    (changes) => onChange(value.id, changes),
    [onChange, value.id],
  );
  useEffect(() => {
    let active = true;
    const fallback = method === "linear" ? (roll?.sellingPrice ?? "") : "";
    patch({
      price: fallback,
      rememberPrice: false,
      pricingLoading: Boolean(roll && customer),
    });
    setError("");
    setSource(
      fallback === ""
        ? "نرخ این فروش را وارد کنید."
        : "نرخ پیشنهادی رول؛ می‌توانید آن را برای این مشتری تغییر دهید.",
    );
    if (!roll || !customer) return;
    api(
      `/customers/${customer._id}/price-suggestion?${query({ vinylId: roll._id, pricingMethod: method })}`,
    )
      .then((result) => {
        if (active && result) {
          patch({ price: result.unitPrice });
          setSource(
            result.source === "sale"
              ? `نرخ فروش قبلی ${customer.name} برای همین نوع، رنگ و عرض. قابل تغییر است.`
              : `نرخ ذخیره‌شدهٔ ${customer.name} برای نوع «${roll.type}». قابل تغییر برای این فروش است.`,
          );
        }
      })
      .catch(() => {
        if (active)
          setError(
            "نرخ ذخیره‌شده دریافت نشد. نرخ را بررسی کرده یا دستی وارد کنید.",
          );
      })
      .finally(() => {
        if (active) patch({ pricingLoading: false });
      });
    return () => {
      active = false;
    };
  }, [customer?._id, roll?._id, method, patch]);
  return (
    <section
      className="panel form-panel sale-line"
      aria-label={`جنس ${index + 1}`}
    >
      <div className="sale-line-heading">
        <h3>جنس {number(index + 1)}</h3>
        {removable && (
          <button type="button" className="sale-remove" onClick={onRemove}>
            <Trash2 size={17} aria-hidden="true" />
            حذف جنس
          </button>
        )}
      </div>
      <Lookup
        kind="vinyl"
        excludedIds={excludedIds}
        selected={roll}
        onSelect={(r) => patch({ roll: r, method: "linear", length: "" })}
      />
      {roll && (
        <div className="roll-info">
          <span>
            {roll.type} · {roll.color}
          </span>
          <strong>{number(available)} متر موجود</strong>
          <span>{number(roll.width)} متر عرض</span>
          <button
            type="button"
            onClick={() => patch({ length: String(available) })}
            disabled={available <= 0}
          >
            تمام رول
          </button>
        </div>
      )}
      <div className="form-grid">
        <Field
          label="طول فروخته‌شده (متر)"
          type="number"
          min="0.001"
          step="0.001"
          max={roll ? available : 1000000}
          required
          value={length}
          onChange={(e) => patch({ length: e.target.value })}
        />
        <Field label="روش قیمت‌گذاری">
          <select
            value={method}
            onChange={(e) => patch({ method: e.target.value })}
          >
            <option value="linear">فی متر طولی</option>
            <option value="area">فی متر مربع</option>
          </select>
        </Field>
        <Field
          label={
            method === "area"
              ? "نرخ مشتری فی متر مربع"
              : "نرخ مشتری فی متر طولی"
          }
          type="number"
          required
          min="0.01"
          max="100000000"
          step="0.01"
          value={price}
          disabled={pricingLoading}
          onChange={(e) => {
            patch({ price: e.target.value });
            setSource("نرخ واردشده برای این فروش.");
          }}
          hint={pricingLoading ? "در حال دریافت نرخ مشتری…" : source}
        />
        <div className="sale-line-total">
          <span>مبلغ این جنس</span>
          <strong>{money(lineTotal(value))}</strong>
          <small>
            {number(
              new Decimal(length || 0).times(roll?.width || 0).toNumber(),
            )}{" "}
            متر مربع
          </small>
        </div>
      </div>
      <ErrorMessage error={error} />
      {customer && (
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={rememberPrice}
            onChange={(e) => patch({ rememberPrice: e.target.checked })}
          />
          ذخیرهٔ این نرخ برای این مشتری و این نوع فرش و قالین
        </label>
      )}
    </section>
  );
}
