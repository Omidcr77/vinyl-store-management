import { useState } from "react";
import { api, query } from "../services/api";
import { useStore, useResource } from "../services/store";
import { Table, Field, Pagination, Modal, ErrorMessage, Loading } from "./UI";
import { formValues } from "../utils/format";

export default function CustomerPrices({ customerId }) {
  const { money, refresh, notice } = useStore();
  const [page, setPage] = useState(1),
    [edit, setEdit] = useState(null),
    [remove, setRemove] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const {
    data,
    error: loadError,
    loading,
  } = useResource(
    `/customers/${customerId}/prices?${query({ page, order: "asc" })}`,
  );
  function open(item) {
    setError("");
    setEdit(item);
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/customers/${customerId}/prices`, {
        method: "PUT",
        body: formValues(event.currentTarget, ["unitPrice"]),
      });
      refresh();
      notice("نرخ اختصاصی مشتری ذخیره شد.");
      setEdit(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function deletePrice() {
    setBusy(true);
    setError("");
    try {
      await api(`/customers/${customerId}/prices/${remove._id}`, {
        method: "DELETE",
      });
      refresh();
      setRemove(null);
      notice("نرخ اختصاصی حذف شد.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel section-gap">
      <div className="panel-heading">
        <div>
          <h2>نرخ‌های اختصاصی مشتری</h2>
          <p>
            برای هر نوع وینیل، نرخ فی متر طولی و متر مربع جداگانه تعیین کنید.
          </p>
        </div>
        <button onClick={() => open({})}>افزودن نرخ</button>
      </div>
      <ErrorMessage error={loadError} />
      {loading && !data ? (
        <Loading />
      ) : (
        <Table
          rows={data?.items}
          empty="هنوز نرخی برای این مشتری ذخیره نشده است. هنگام فروش نیز می‌توانید نرخ را ذخیره کنید."
          columns={[
            { key: "type", label: "نوع وینیل" },
            {
              key: "pricingMethod",
              label: "روش قیمت‌گذاری",
              render: (r) =>
                r.pricingMethod === "area" ? "فی متر مربع" : "فی متر طولی",
            },
            {
              key: "unitPrice",
              label: "نرخ مشتری",
              render: (r) => money(r.unitPrice),
            },
            {
              key: "actions",
              label: "عملیات",
              render: (r) => (
                <div className="row-actions">
                  <button onClick={() => open(r)}>ویرایش نرخ</button>
                  <button
                    onClick={() => {
                      setError("");
                      setRemove(r);
                    }}
                  >
                    حذف نرخ
                  </button>
                </div>
              ),
            },
          ]}
        />
      )}
      <Pagination data={data} onChange={setPage} />
      {edit && (
        <Modal
          title={edit._id ? "ویرایش نرخ مشتری" : "افزودن نرخ مشتری"}
          onClose={() => {
            if (!busy) setEdit(null);
          }}
        >
          <form onSubmit={save}>
            <div className="form-grid">
              <Field
                label="نوع وینیل"
                name="type"
                required
                maxLength={200}
                defaultValue={edit.type}
                readOnly={Boolean(edit._id)}
                hint="نام نوع باید با نوع ثبت‌شده در موجودی یکسان باشد."
              />
              <Field label="روش قیمت‌گذاری">
                <select
                  name="pricingMethod"
                  defaultValue={edit.pricingMethod || "linear"}
                  disabled={Boolean(edit._id)}
                >
                  <option value="linear">فی متر طولی</option>
                  <option value="area">فی متر مربع</option>
                </select>
              </Field>
              {edit._id && (
                <input
                  type="hidden"
                  name="pricingMethod"
                  value={edit.pricingMethod}
                />
              )}
              <Field
                label="نرخ مشتری"
                name="unitPrice"
                type="number"
                min="0.01"
                max="100000000"
                step="0.01"
                required
                defaultValue={edit.unitPrice}
              />
            </div>
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
                {busy ? "در حال ذخیره…" : "ذخیرهٔ نرخ"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {remove && (
        <Modal
          title="حذف نرخ اختصاصی؟"
          onClose={() => {
            if (!busy) setRemove(null);
          }}
        >
          <p>
            تنها نرخ پیشنهادی این مشتری حذف می‌شود. نرخ و مبلغ بل‌های قبلی تغییر
            نمی‌کند.
          </p>
          <ErrorMessage error={error} />
          <div className="form-footer">
            <button disabled={busy} onClick={() => setRemove(null)}>
              انصراف
            </button>
            <button className="danger" disabled={busy} onClick={deletePrice}>
              تأیید حذف نرخ
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
