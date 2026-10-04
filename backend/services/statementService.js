import database from "../db/mysql.js";
import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import Payment from "../models/Payment.js";
import Settings from "../models/Settings.js";
import { id } from "../utils/validation.js";
import { required } from "../utils/errors.js";
import { renderStatement } from "../../shared/bill.js";
import { sendDocumentPdf } from "./documentService.js";

export async function statementData(customerId) {
  const parsedId = id.parse(customerId);
  return database.connection.transaction(
    async (session) => {
      const customer = required(
        await Customer.findById(parsedId).session(session).lean(),
      );
      const sales = await Sale.find({ customerId: parsedId })
        .sort({ soldDate: 1, _id: 1 })
        .session(session)
        .lean();
      const payments = await Payment.find({ customerId: parsedId })
        .sort({ date: 1, _id: 1 })
        .session(session)
        .lean();
      const settings = await Settings.findById("store").session(session).lean();
      const sum = (rows, field) =>
        rows.reduce((n, r) => n + Math.round(Number(r[field] || 0) * 100), 0);
      const initialMinor = sum(sales, "paidAmount"),
        receiptMinor = sum(payments, "amount");
      return {
        customer,
        sales,
        payments,
        settings,
        generatedAt: new Date().toISOString(),
        summary: {
          totalPurchases: sum(sales, "totalAmount") / 100,
          initialPaid: initialMinor / 100,
          receiptPaid: receiptMinor / 100,
          totalPayments: (initialMinor + receiptMinor) / 100,
          balance: customer.balanceMinor / 100,
        },
      };
    },
    { readConcern: { level: "snapshot" } },
  );
}
export async function statementGet(req, res) {
  res.json({ success: true, data: await statementData(req.params.id) });
}
export async function statementPdf(req, res) {
  const data = await statementData(req.params.id);
  return sendDocumentPdf(
    res,
    renderStatement(data),
    `statement-${data.customer._id}`,
  );
}
