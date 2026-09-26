import { useResource, useStore } from "../services/store";
import { Modal, Loading, ErrorMessage, Table } from "./UI";
import PrintDocument from "./PrintDocument";
import DocumentActions from "./DocumentActions";
import { date } from "../utils/format";
export function SalePrint({ sale, onClose }) {
  const { money } = useStore();
  return (
    <PrintDocument
      title={`بل فروش ${sale.billNumber}`}
      customer={{
        name: sale.customerName,
        phone: sale.customerPhone,
        address: sale.customerAddress,
      }}
      sales={[sale]}
      summary={{
        مجموع: money(sale.totalAmount, sale.currency),
        "پرداخت هنگام فروش": money(sale.paidAmount, sale.currency),
        "باقی‌داری فعلی": money(sale.remainingBalance, sale.currency),
      }}
      onClose={onClose}
      pdfPath={`/sales/${sale._id}`}
      filename={sale.billNumber}
    />
  );
}
export function ReceiptPrint({ id, onClose }) {
  const { data: receipt, error, loading } = useResource(`/payments/${id}`),
    { money, settings } = useStore();
  return (
    <Modal title="رسید پرداخت" onClose={onClose}>
      <ErrorMessage error={error} />
      {loading && !receipt && <Loading />}
      {receipt && (
        <>
          <div className="print-document">
            <header>
              <h1>{settings.storeName}</h1>
              <p>
                {settings.storeAddress} · {settings.phone}
              </p>
              <h2>رسید پرداخت {receipt.receiptNumber}</h2>
              <p>{date(receipt.date)}</p>
            </header>
            <h3>{receipt.customerName}</h3>
            <p>
              {receipt.customerPhone} · {receipt.customerAddress}
            </p>
            <div className="print-summary">
              <p>
                مبلغ پرداخت:{" "}
                <strong>{money(receipt.amount, receipt.currency)}</strong>
              </p>
              <p>
                روش پرداخت:{" "}
                {
                  { cash: "نقد", bank: "بانک", other: "سایر" }[
                    receipt.paymentMethod
                  ]
                }
              </p>
              <p>مرجع: {receipt.reference || "—"}</p>
              {receipt.balanceBefore != null && (
                <>
                  <p>
                    باقی‌داری قبل از پرداخت:{" "}
                    {money(receipt.balanceBefore, receipt.currency)}
                  </p>
                  <p>
                    باقی‌داری پس از پرداخت:{" "}
                    {money(receipt.balanceAfter, receipt.currency)}
                  </p>
                </>
              )}
            </div>
            <h3>پرداخت بابت بل‌ها</h3>
            <Table
              rows={receipt.allocations.map((a) => ({ ...a, _id: a.saleId }))}
              columns={[
                { key: "billNumber", label: "شمارهٔ بل" },
                {
                  key: "amount",
                  label: "مبلغ",
                  render: (a) => money(a.amount, receipt.currency),
                },
              ]}
            />
            <p>{receipt.details}</p>
            <p className="invoice-footer">{settings.invoiceFooter}</p>
          </div>
          <DocumentActions
            path={`/payments/${id}`}
            filename={receipt.receiptNumber}
          />
        </>
      )}
    </Modal>
  );
}
