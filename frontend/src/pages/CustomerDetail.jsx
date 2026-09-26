import { ReceiptPrint } from "../components/RecordPrint";
import { Photo } from "../components/ImagePicker";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Pencil, Plus, Printer } from "lucide-react";
import { allRecords, query } from "../services/api";
import { useResource, useStore } from "../services/store";
import {
  PageHeading,
  SummaryCard,
  Table,
  Pagination,
  ErrorMessage,
  Loading,
  BackLink,
} from "../components/UI";
import CustomerForm from "../components/CustomerForm";
import PaymentForm from "../components/PaymentForm";
import CustomerPrices from "../components/CustomerPrices";
import SaleTable from "../components/SaleTable";
import PrintDocument from "../components/PrintDocument";
import { date } from "../utils/format";
export default function CustomerDetail() {
  const { id } = useParams(),
    { money } = useStore(),
    [purchasePage, setPurchasePage] = useState(1),
    [paymentPage, setPaymentPage] = useState(1),
    [edit, setEdit] = useState(false),
    [receipt, setReceipt] = useState(null),
    [pay, setPay] = useState(false),
    [print, setPrint] = useState(null),
    [printBusy, setPrintBusy] = useState(false),
    [printError, setPrintError] = useState("");
  const { data, error, loading } = useResource(
    `/customers/${id}?${query({ purchasePage, paymentPage })}`,
  );
  async function statement() {
    setPrintBusy(true);
    setPrintError("");
    try {
      const [sales, payments] = await Promise.all([
        allRecords("/sales", { customerId: id }),
        allRecords("/payments", { customerId: id }),
      ]);
      setPrint({ sales, payments });
    } catch (e) {
      setPrintError(e.message);
    } finally {
      setPrintBusy(false);
    }
  }
  return (
    <>
      <BackLink to="/customers">برگشت به مشتریان</BackLink>
      <ErrorMessage error={error} />
      {loading && !data && <Loading />}
      {data && (
        <>
          <PageHeading
            eyebrow="حساب مشتری"
            title={data.customer.name}
            description={`${data.customer.phone}${data.customer.address ? " · " + data.customer.address : ""}`}
          >
            <button onClick={() => setEdit(true)}>
              <Pencil size={16} /> ویرایش مشتری
            </button>
            <button disabled={printBusy} onClick={statement}>
              <Printer size={16} />
              {printBusy ? "در حال آماده‌سازی…" : "چاپ صورت‌حساب"}
            </button>
            <Link className="button" to={`/sales/new?customerId=${id}`}>
              <Plus size={16} /> فروش جدید
            </Link>
            <button
              className="primary"
              disabled={data.customer.balance <= 0}
              onClick={() => setPay(true)}
            >
              ثبت پرداخت
            </button>
          </PageHeading>
          <ErrorMessage error={printError} />
          {data.customer.img && (
            <Photo src={data.customer.img} name={data.customer.name} large />
          )}
          <div className="summary-grid three">
            <SummaryCard
              label="مجموع خریدها"
              value={money(data.summary.totalPurchases)}
              detail="تمام خریدهای مشتری"
            />
            <SummaryCard
              label="مجموع پرداخت‌ها"
              value={money(data.summary.totalPayments)}
              detail="پرداخت هنگام فروش و رسیدهای بعدی"
            />
            <SummaryCard
              label="باقی‌داری"
              value={money(data.customer.balance)}
              detail="مبلغ فعلی قابل پرداخت"
              accent
            />
          </div>
          <CustomerPrices customerId={id} />
          <section className="panel section-gap">
            <div className="panel-heading">
              <div>
                <h2>تاریخچهٔ خریدها</h2>
                <p>پرداخت هنگام فروش و باقی‌داری فعلی</p>
              </div>
            </div>
            <SaleTable rows={data.purchases.items} />
            <Pagination data={data.purchases} onChange={setPurchasePage} />
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>رسیدهای پرداخت</h2>
                <p>پرداخت‌های بعدی بابت بل‌های دارای باقی‌داری</p>
              </div>
            </div>
            <Table
              rows={data.receipts.items}
              columns={[
                {
                  key: "print",
                  label: "رسید",
                  render: (r) => (
                    <button onClick={() => setReceipt(r._id)}>
                      چاپ رسید / PDF
                    </button>
                  ),
                },
                { key: "receiptNumber", label: "شمارهٔ رسید" },
                { key: "date", label: "تاریخ", render: (r) => date(r.date) },
                {
                  key: "amount",
                  label: "مبلغ",
                  render: (r) => <strong>{money(r.amount, r.currency)}</strong>,
                },
                { key: "paymentMethod", label: "روش" },
                { key: "reference", label: "مرجع" },
                { key: "details", label: "توضیحات" },
              ]}
            />
            <Pagination data={data.receipts} onChange={setPaymentPage} />
          </section>
          {receipt && (
            <ReceiptPrint id={receipt} onClose={() => setReceipt(null)} />
          )}
          {edit && (
            <CustomerForm
              customer={data.customer}
              onClose={() => setEdit(false)}
            />
          )}
          {pay && (
            <PaymentForm
              customer={data.customer}
              onClose={() => setPay(false)}
            />
          )}
          {print && (
            <PrintDocument
              title="صورت‌حساب مشتری"
              customer={data.customer}
              {...print}
              summary={{
                "مجموع خریدها": money(data.summary.totalPurchases),
                "مجموع پرداخت‌ها": money(data.summary.totalPayments),
                "باقی‌داری فعلی": money(data.customer.balance),
              }}
              onClose={() => setPrint(null)}
            />
          )}
        </>
      )}
    </>
  );
}
