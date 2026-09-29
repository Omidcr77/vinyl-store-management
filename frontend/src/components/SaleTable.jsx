import { useState } from "react";
import { SalePrint } from "./RecordPrint";
import { Link } from "react-router-dom";
import { Table, Badge } from "./UI";
import { useStore } from "../services/store";
import { number } from "../utils/format";
export default function SaleTable({ rows, view = "table" }) {
  const { date, money } = useStore();
  const [print, setPrint] = useState(null);
  return (
    <>
      <Table
        view={view}
        rows={rows}
        columns={[
          {
            key: "print",
            label: "سند",
            render: (r) => (
              <button onClick={() => setPrint(r)}>چاپ بل / PDF</button>
            ),
          },
          {
            key: "billNumber",
            label: "شمارهٔ بل",
            render: (r) => (
              <Link className="record-link" to={`/sales/${r._id}`}>
                {r.billNumber}
              </Link>
            ),
          },
          { key: "soldDate", label: "تاریخ", render: (r) => date(r.soldDate) },
          { key: "customerName", label: "مشتری" },
          {
            key: "vinylName",
            label: "وینیل",
            render: (r) => (
              <div>
                <strong>{r.vinylName}</strong>
                <small className="cell-sub">شمارهٔ رول{r.rollNumber}</small>
              </div>
            ),
          },
          {
            key: "soldLength",
            label: "طول / مساحت",
            render: (r) => (
              <>
                {number(r.soldLength)} متر
                <small className="cell-sub">{number(r.area)} متر مربع</small>
              </>
            ),
          },
          {
            key: "totalAmount",
            label: "مجموع",
            render: (r) => money(r.totalAmount, r.currency),
          },
          {
            key: "paidAmount",
            label: "پرداخت هنگام فروش",
            render: (r) => (
              <>
                {money(r.paidAmount, r.currency)}
                {r.creditApplied > 0 && (
                  <small className="cell-sub">
                    از طلب مشتری: {money(r.creditApplied, r.currency)}
                  </small>
                )}
              </>
            ),
          },
          {
            key: "remainingBalance",
            label: "باقی‌داری فعلی",
            render: (r) => (
              <span className={r.remainingBalance > 0 ? "debt" : ""}>
                {money(r.remainingBalance, r.currency)}
              </span>
            ),
          },
          {
            key: "paymentType",
            label: "پرداخت",
            render: (r) => <Badge value={r.paymentType} />,
          },
        ]}
      />
      {print && <SalePrint sale={print} onClose={() => setPrint(null)} />}
    </>
  );
}
