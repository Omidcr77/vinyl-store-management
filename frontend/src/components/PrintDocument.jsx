import { saleItems } from "../../../shared/sale-items.js";
import { useStore } from "../services/store";
import { Modal, Table } from "./UI";
import { number, customerName } from "../utils/format";
import DocumentActions from "./DocumentActions";
import BillDocument from "./BillDocument";
export default function PrintDocument({
  title,
  customer,
  sales = [],
  payments = [],
  summary,
  onClose,
  pdfPath,
  filename,
}) {
  const { date, settings, money } = useStore();
  if (pdfPath && sales.length === 1)
    return (
      <Modal title="پیش‌نمایش بل" onClose={onClose} className="bill-modal">
        <BillDocument record={sales[0]} settings={settings || {}} />
        <div className="form-footer no-print">
          <button onClick={onClose}>بستن</button>
          <DocumentActions path={pdfPath} filename={filename} />
        </div>
      </Modal>
    );
  return (
    <Modal title={title} onClose={onClose}>
      <div className="print-document">
        <header>
          <h1>{settings?.storeName}</h1>
          <p>
            {settings?.storeAddress} {settings?.phone}
          </p>
          <h2>{title}</h2>
          <p>تاریخ چاپ {date(new Date())}</p>
        </header>
        {customer && (
          <section>
            <h3>{customerName(customer.name)}</h3>
            <p>
              {customer.phone} · {customer.address}
            </p>
          </section>
        )}
        {summary && (
          <div className="print-summary">
            {Object.entries(summary).map(([key, value]) => (
              <p key={key}>
                <strong>{key}: </strong>
                {value}
              </p>
            ))}
          </div>
        )}
        <Table
          rows={sales}
          columns={[
            { key: "billNumber", label: "بل" },
            {
              key: "soldDate",
              label: "تاریخ",
              render: (r) => date(r.soldDate),
            },
            {
              key: "vinylName",
              label: "فرش و قالین",
              render: (r) =>
                saleItems(r)
                  .map(
                    (i) =>
                      `${i.vinylName} (#${i.rollNumber}) · ${i.type} · ${i.color}`,
                  )
                  .join(" / "),
            },
            {
              key: "soldLength",
              label: "ابعاد",
              render: (r) =>
                saleItems(r)
                  .map(
                    (i) =>
                      `${number(i.soldLength)} × ${number(i.width)} متر / ${number(i.area)} متر مربع`,
                  )
                  .join(" / "),
            },
            {
              key: "unit",
              label: "نرخ واحد",
              render: (r) =>
                saleItems(r)
                  .map(
                    (i) =>
                      `${money(i.pricePerMeter ?? i.pricePerSquareMeter, r.currency)}/${i.pricingMethod === "area" ? "متر مربع" : "متر"}`,
                  )
                  .join(" / "),
            },
            {
              key: "totalAmount",
              label: "مجموع",
              render: (r) => money(r.totalAmount, r.currency),
            },
            {
              key: "paidAmount",
              label: "هنگام فروش",
              render: (r) => money(r.paidAmount, r.currency),
            },
            {
              key: "remainingBalance",
              label: "باقی‌داری فعلی",
              render: (r) => money(r.remainingBalance, r.currency),
            },
          ]}
        />
        {payments.length > 0 && (
          <>
            <h3>رسیدهای پرداخت</h3>
            <Table
              rows={payments}
              columns={[
                { key: "date", label: "تاریخ", render: (r) => date(r.date) },
                {
                  key: "amount",
                  label: "مبلغ",
                  render: (r) => money(r.amount),
                },
                { key: "paymentMethod", label: "روش" },
                { key: "details", label: "توضیحات" },
                { key: "reference", label: "مرجع" },
              ]}
            />
          </>
        )}
        <p className="invoice-footer">{settings?.invoiceFooter}</p>
      </div>
      <div className="form-footer no-print">
        <button onClick={onClose}>بستن</button>
        {pdfPath ? (
          <DocumentActions path={pdfPath} filename={filename} />
        ) : (
          <button className="primary" onClick={() => window.print()}>
            چاپ / ذخیرهٔ PDF
          </button>
        )}
      </div>
    </Modal>
  );
}
