import { renderBill } from "../../../shared/bill.js";
export default function BillDocument({ record, settings, receipt = false }) {
  return (
    <div
      className="print-document bill-document"
      dangerouslySetInnerHTML={{
        __html: renderBill({ record, settings, receipt }),
      }}
    />
  );
}
