import SupplierPicker from "./SupplierPicker";
import { randomUUID } from "../utils/uuid";
import { useRef, useState } from "react";
import DeleteIcon from "./DeleteIcon";
import ImagePicker, { Photo } from "./ImagePicker";
import { api } from "../services/api";
import { useStore } from "../services/store";
import { Modal, Field, ErrorMessage, Table } from "./UI";
import { number, today } from "../utils/format";

const blank = (width) => ({
  id: randomUUID(),
  vinylName: "",
  type: "",
  color: "",
  width: String(width || 4),
  length: "",
  quantity: "1",
  lengths: "",
  mode: "quantity",
  costPrice: "",
  importCost: "",
  sellingPrice: "",
  details: "",
  img: "",
});
const listLengths = (text) =>
  text
    .trim()
    .split(/[\s,،;]+/)
    .filter(Boolean)
    .map(Number);
function prepare(rows, shared) {
  const parsed = rows.map((row, index) => {
    const fail = (message) => {
      throw new Error(`ردیف ${index + 1}: ${message}`);
    };
    const positive = (value) =>
      Number.isFinite(value) &&
      value > 0 &&
      value <= 1000000 &&
      Math.abs(value * 1000 - Math.round(value * 1000)) < 0.000001;
    if (!row.type.trim() || !row.color.trim()) fail("نوع و رنگ را وارد کنید.");
    if (!positive(Number(row.width)))
      fail("عرض معتبر با حداکثر 3 رقم اعشار وارد کنید.");
    const result = {
      vinylName: row.vinylName.trim() || row.type.trim(),
      type: row.type.trim(),
      color: row.color.trim(),
      width: Number(row.width),
      details: row.details,
      img: row.img || "",
    };
    if (row.mode === "lengths") {
      result.lengths = listLengths(row.lengths);
      if (!result.lengths.length || result.lengths.some((n) => !positive(n)))
        fail("لیست طول‌ها باید عددهای مثبت با حداکثر 3 رقم اعشار باشد.");
    } else {
      result.length = Number(row.length);
      result.quantity = Number(row.quantity);
      if (!positive(result.length)) fail("طول معتبر وارد کنید.");
      if (
        !Number.isInteger(result.quantity) ||
        result.quantity < 1 ||
        result.quantity > 1000
      )
        fail("تعداد باید عدد صحیح بین 1 و 1000 باشد.");
    }
    for (const key of ["costPrice", "sellingPrice", "importCost"])
      if (row[key] !== "") {
        result[key] = Number(row[key]);
        if (
          !Number.isFinite(result[key]) ||
          result[key] < 0 ||
          result[key] > 100000000 ||
          Math.abs(result[key] * 100 - Math.round(result[key] * 100)) > 0.000001
        )
          fail("قیمت معتبر با حداکثر 2 رقم اعشار وارد کنید.");
      }
    return result;
  });
  const count = parsed.reduce(
    (sum, r) => sum + (r.lengths?.length || r.quantity),
    0,
  );
  if (!parsed.length || parsed.length > 200 || count > 1000)
    throw new Error("هر ورود باید 1 تا 200 ردیف و حداکثر 1000 رول داشته باشد.");
  if (shared.supplierId && parsed.some((r) => r.costPrice == null))
    throw new Error("برای حساب تهیه‌کننده، قیمت خرید تمام اجناس را وارد کنید.");
  return {
    ...shared,
    supplierId: shared.supplierId || undefined,
    paidAmount: Number(shared.paidAmount || 0),
    rows: parsed,
  };
}
export default function DeliveryForm({ onClose }) {
  const { settings, refresh, notice, money, date } = useStore();
  const [rows, setRows] = useState(() => [blank(settings?.defaultVinylWidth)]);
  const [active, setActive] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [shared, setShared] = useState({
    supplier: "",
    supplierId: "",
    paidAmount: "0",
    reference: "",
    entryDate: today(),
  });
  const [review, setReview] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false);
  const key = useRef(randomUUID());
  const close = () => {
    if (!busy && !uploading) onClose();
  };
  const update = (id, field, value) =>
    setRows((current) =>
      current.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  async function importFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 2 * 1024 * 1024)
        throw new Error("حجم فایل نباید بیشتر از 2 مگابایت باشد.");
      const body = new FormData();
      body.append("file", file);
      const result = await api("/deliveries/import", { method: "POST", body });
      const imported = result.rows.map((r) => ({
        ...blank(settings?.defaultVinylWidth),
        ...r,
        mode: r.lengths ? "lengths" : "quantity",
      }));
      const existing = rows.filter(
        (r) =>
          r.vinylName || r.type || r.color || r.length || r.lengths || r.img,
      );
      if (existing.length + imported.length > 200)
        throw new Error("حداکثر 200 ردیف مجاز است.");
      setRows([...existing, ...imported]);
      setActive(imported[0]?.id);
    } catch (e) {
      setError(e.message);
      const index = Number(e.message.match(/ردیف (\d+)/)?.[1]) - 1;
      if (rows[index]) setActive(rows[index].id);
    } finally {
      setBusy(false);
    }
  }
  function preview(e) {
    e.preventDefault();
    if (uploading) return;
    setError("");
    try {
      if (!shared.entryDate) throw new Error("تاریخ ورود را وارد کنید.");
      setReview(prepare(rows, shared));
    } catch (e) {
      setError(e.message);
      const index = Number(e.message.match(/ردیف (\d+)/)?.[1]) - 1;
      if (rows[index]) setActive(rows[index].id);
    }
  }
  async function save() {
    setBusy(true);
    setAttempted(true);
    setError("");
    try {
      const result = await api("/deliveries", {
        method: "POST",
        body: review,
        headers: { "Idempotency-Key": key.current },
      });
      refresh();
      notice(
        `${result.rollCount} رکورد ثبت شد. ${result.deliveryNumber} · شماره‌های ${result.firstRollNumber} تا ${result.lastRollNumber}`,
      );
      onClose();
    } catch (e) {
      if (e.status >= 400 && e.status < 500 && e.status !== 409)
        setAttempted(false);
      setError(
        `${e.message} برای کوشش دوباره، دکمهٔ ثبت را بزنید؛ این درخواست دوباره ثبت نمی‌شود.`,
      );
    } finally {
      setBusy(false);
    }
  }
  const total = review?.rows.reduce(
    (sum, r) => sum + (r.lengths?.length || r.quantity),
    0,
  );
  const count = (row) =>
    row.mode === "lengths"
      ? listLengths(row.lengths).length
      : Number(row.quantity) || 0;
  const draftTotal = rows.reduce((sum, row) => sum + count(row), 0);
  function addGroup(copy) {
    const next = copy
      ? { ...copy, id: randomUUID() }
      : blank(settings?.defaultVinylWidth);
    setRows((current) => [...current, next]);
    setActive(next.id);
  }
  return (
    <Modal
      title="ثبت ورود اجناس"
      onClose={close}
      className="delivery-modal simple-delivery"
    >
      <div className="delivery-example">
        <strong>مثلاً 20 رول یکسان دارید؟</strong>
        <p>نوع، رنگ و اندازه را یک‌بار بنویسید و تعداد را 20 بگذارید.</p>
      </div>
      <ErrorMessage error={error} />
      {review ? (
        <>
          <h3>آیا این معلومات درست است؟</h3>
          <p>
            {number(total)} رول آمادهٔ ثبت است. هر رول شمارهٔ جداگانه می‌گیرد.
          </p>
          <Table
            rows={review.rows.map((r, i) => ({ ...r, _id: i }))}
            columns={[
              {
                key: "img",
                label: "عکس",
                render: (r) => <Photo src={r.img} name={r.vinylName} />,
              },
              { key: "vinylName", label: "جنس" },
              { key: "color", label: "رنگ" },
              {
                key: "quantity",
                label: "تعداد",
                render: (r) => number(r.lengths?.length || r.quantity),
              },
              {
                key: "length",
                label: "طول × عرض (متر)",
                render: (r) =>
                  `${r.lengths ? r.lengths.map(number).join(", ") : number(r.length)} × ${number(r.width)}`,
              },
              {
                key: "costPrice",
                label: "خرید / متر",
                render: (r) => (r.costPrice == null ? "—" : money(r.costPrice)),
              },
            ]}
          />
          <p>
            مجموع خرید از شرکت:{" "}
            {money(
              review.rows.reduce(
                (sum, r) =>
                  sum +
                  (r.costPrice || 0) *
                    (r.lengths
                      ? r.lengths.reduce((a, b) => a + b, 0)
                      : r.length * r.quantity),
                0,
              ),
            )}
          </p>
          <p>
            تهیه‌کننده: {shared.supplier || "بدون حساب"} · پرداخت اولیه:{" "}
            {money(Number(shared.paidAmount || 0))}
          </p>
          <p>
            هزینهٔ ورود مجموعی:{" "}
            {money(
              review.rows.reduce(
                (sum, r) =>
                  sum + (r.importCost || 0) * (r.lengths?.length || r.quantity),
                0,
              ),
            )}
          </p>
          <details className="delivery-extra">
            <summary>دیدن معلومات بیشتر</summary>
            <p>
              {shared.supplier || "بدون تهیه‌کننده"} ·{" "}
              {shared.reference || "بدون مرجع"} · {date(shared.entryDate)}
            </p>
            {review.rows.map((r, i) => (
              <p key={i}>
                {r.vinylName} · {r.type} · نرخ پیشنهادی:{" "}
                {r.sellingPrice == null ? "—" : money(r.sellingPrice)} ·{" "}
                {r.details || "بدون یادداشت"}
              </p>
            ))}
          </details>
          <div className="form-footer delivery-footer">
            <button
              disabled={busy || attempted}
              onClick={() => {
                setReview(null);
                setError("");
              }}
            >
              برگشت به ویرایش
            </button>
            <button className="primary" disabled={busy} onClick={save}>
              {busy ? "در حال ثبت…" : `ثبت ${total} رکورد`}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={preview} noValidate>
          <fieldset disabled={busy || uploading} className="delivery-fields">
            <SupplierPicker
              onChange={(supplier) =>
                setShared((s) => ({
                  ...s,
                  supplierId: supplier?._id || "",
                  supplier: supplier?.name || "",
                }))
              }
            />
            <Field
              label={`پرداخت اولیه به تهیه‌کننده (${settings?.currency || "USD"})`}
              type="number"
              min="0"
              step="0.01"
              value={shared.paidAmount}
              onChange={(e) =>
                setShared((s) => ({ ...s, paidAmount: e.target.value }))
              }
              hint="صفر = خرید قرضی. هزینهٔ حمل جدا از حساب تهیه‌کننده ثبت می‌شود."
            />
            {rows.map((row, i) => {
              const expanded = (active || rows[0]?.id) === row.id;
              return (
                <section
                  className="delivery-row"
                  key={row.id}
                  aria-label={`جنس ${i + 1}`}
                >
                  <button
                    className="delivery-group-toggle"
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setActive(row.id)}
                  >
                    {row.img && <Photo src={row.img} name={row.type} />}
                    <strong>
                      {row.type || `جنس ${i + 1}`}
                      {row.color ? ` · ${row.color}` : ""}
                    </strong>
                    <span>
                      {count(row)} رول ·{" "}
                      {expanded ? "در حال واردکردن" : "ویرایش"}
                    </span>
                  </button>
                  {expanded && (
                    <>
                      <div className="delivery-grid">
                        <Field
                          label="نوع"
                          placeholder="مثلاً فرش طرح چوب یا قالین"
                          required
                          maxLength={200}
                          value={row.type}
                          onChange={(e) =>
                            update(row.id, "type", e.target.value)
                          }
                        />
                        <Field
                          label="رنگ"
                          placeholder="مثلاً قهوه‌ای"
                          required
                          maxLength={200}
                          value={row.color}
                          onChange={(e) =>
                            update(row.id, "color", e.target.value)
                          }
                        />
                        <Field
                          label="عرض (متر)"
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={row.width}
                          onChange={(e) =>
                            update(row.id, "width", e.target.value)
                          }
                        />
                        {row.mode === "quantity" && (
                          <>
                            <Field
                              label="طول هر رول (متر)"
                              placeholder="مثلاً 30"
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={row.length}
                              onChange={(e) =>
                                update(row.id, "length", e.target.value)
                              }
                            />
                            <Field
                              label="تعداد رول"
                              type="number"
                              min="1"
                              max="1000"
                              step="1"
                              value={row.quantity}
                              onChange={(e) =>
                                update(row.id, "quantity", e.target.value)
                              }
                            />
                          </>
                        )}
                        <Field
                          label={`قیمت خرید فی متر (${settings?.currency || "USD"})`}
                          placeholder="اختیاری"
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.costPrice}
                          onChange={(e) =>
                            update(row.id, "costPrice", e.target.value)
                          }
                        />
                        <Field
                          label={`هزینهٔ ورود هر رول (${settings?.currency || "USD"})`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.importCost}
                          onChange={(e) =>
                            update(row.id, "importCost", e.target.value)
                          }
                          hint="برای هر رول این ردیف؛ به قیمت خرید اضافه می‌شود."
                        />
                      </div>
                      <label className="delivery-length-switch">
                        <input
                          type="checkbox"
                          checked={row.mode === "lengths"}
                          onChange={(e) =>
                            update(
                              row.id,
                              "mode",
                              e.target.checked ? "lengths" : "quantity",
                            )
                          }
                        />
                        طول رول‌ها یکسان نیست
                      </label>
                      {row.mode === "lengths" && (
                        <Field label="لیست طول‌ها (متر)">
                          <textarea
                            aria-label="لیست طول‌ها (متر)"
                            rows="2"
                            placeholder="30, 28, 25"
                            value={row.lengths}
                            onChange={(e) =>
                              update(row.id, "lengths", e.target.value)
                            }
                          />
                          <small>
                            مثلاً 30, 28, 25 یعنی 3 رول با این طول‌ها. تعداد
                            خودکار حساب می‌شود.
                          </small>
                        </Field>
                      )}
                      <div className="delivery-group-photo">
                        <ImagePicker
                          defaultValue={row.img}
                          onChange={(value) => update(row.id, "img", value)}
                          onBusy={setUploading}
                        />
                        <p>
                          این عکس برای تمام رول‌های این جنس استفاده می‌شود. برای
                          رنگ دیگر می‌توانید عکس جداگانه انتخاب کنید.
                        </p>
                      </div>
                      <details className="delivery-extra">
                        <summary>
                          نام خاص، قیمت فروش و یادداشت (اختیاری)
                        </summary>
                        <div className="delivery-grid">
                          <Field
                            label="نام جنس"
                            placeholder="اگر خالی باشد، نوع جنس استفاده می‌شود"
                            maxLength={200}
                            value={row.vinylName}
                            onChange={(e) =>
                              update(row.id, "vinylName", e.target.value)
                            }
                          />
                          <Field
                            label={`نرخ پیشنهادی فی متر (${settings?.currency || "USD"})`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.sellingPrice}
                            onChange={(e) =>
                              update(row.id, "sellingPrice", e.target.value)
                            }
                          />
                          <Field
                            label="توضیحات ردیف"
                            maxLength={3000}
                            value={row.details}
                            onChange={(e) =>
                              update(row.id, "details", e.target.value)
                            }
                          />
                        </div>
                      </details>
                      <div className="delivery-group-actions">
                        <button
                          type="button"
                          disabled={rows.length >= 200}
                          onClick={() => addGroup(row)}
                        >
                          همین جنس با رنگ یا اندازهٔ دیگر
                        </button>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setRows((current) =>
                                current.filter((r) => r.id !== row.id),
                              );
                              setActive(null);
                            }}
                          >
                            <DeleteIcon /> حذف این جنس
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </section>
              );
            })}
            <button
              type="button"
              disabled={rows.length >= 200}
              onClick={() => addGroup()}
            >
              + افزودن جنس دیگر
            </button>
            <details className="delivery-extra">
              <summary>تهیه‌کننده و تاریخ ورود (اختیاری)</summary>
              <div className="delivery-grid">
                <Field
                  label="تهیه‌کنندهٔ محموله"
                  value={shared.supplier}
                  maxLength={200}
                  onChange={(e) =>
                    setShared({ ...shared, supplier: e.target.value })
                  }
                />
                <Field
                  label="شمارهٔ مرجع محموله"
                  value={shared.reference}
                  maxLength={200}
                  onChange={(e) =>
                    setShared({ ...shared, reference: e.target.value })
                  }
                />
                <Field
                  label="تاریخ ورود محموله"
                  type="date"
                  value={shared.entryDate}
                  onChange={(e) =>
                    setShared({ ...shared, entryDate: e.target.value })
                  }
                />
              </div>
            </details>
            <details className="delivery-extra">
              <summary>لیست Excel دارید؟</summary>
              <p>
                فایل نمونه را پُر کنید. پس از آپلود، می‌توانید معلومات را اصلاح
                کنید.
              </p>
              <div className="delivery-import">
                <a className="button" href="/api/deliveries/template" download>
                  دانلود نمونهٔ Excel
                </a>
                <label>
                  واردکردن فایل Excel
                  <input type="file" accept=".xlsx" onChange={importFile} />
                </label>
              </div>
            </details>
            <div className="form-footer delivery-footer">
              <span>
                {number(draftTotal)} رول · {number(rows.length)} جنس
              </span>
              <button type="button" onClick={close}>
                انصراف
              </button>
              <button className="primary" type="submit">
                بررسی محموله
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
