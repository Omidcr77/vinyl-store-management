import { renderStatement } from "../../../shared/bill.js";
import { Modal } from "./UI";
import DocumentActions from "./DocumentActions";
export default function StatementPrint({ data, onClose }) {
  return (
    <Modal title="پیش‌نمایش صورت‌حساب" onClose={onClose} className="bill-modal">
      <div
        className="print-document bill-document"
        dangerouslySetInnerHTML={{ __html: renderStatement(data) }}
      />
      <div className="form-footer no-print">
        <button onClick={onClose}>بستن</button>
        <DocumentActions
          path={`/customers/${data.customer._id}/statement`}
          filename={`statement-${data.customer._id}`}
        />
      </div>
    </Modal>
  );
}
