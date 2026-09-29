import { useResource, useStore } from "../services/store";
import { Modal, Loading, ErrorMessage } from "./UI";
import PrintDocument from "./PrintDocument";
import DocumentActions from "./DocumentActions";
import BillDocument from "./BillDocument";
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
    { settings } = useStore();
  return (
    <Modal className="bill-modal" title="رسید پرداخت" onClose={onClose}>
      <ErrorMessage error={error} />
      {loading && !receipt && <Loading />}
      {receipt && (
        <>
          <BillDocument record={receipt} settings={settings || {}} receipt />
          <div className="form-footer no-print">
            <DocumentActions
              path={`/payments/${id}`}
              filename={receipt.receiptNumber}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
