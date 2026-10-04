import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
dotenv.config({
  path: fileURLToPath(new URL("../backend/.env", import.meta.url)),
  quiet: true,
});
import database from "../backend/db/mysql.js";
import { mkdir, writeFile } from "node:fs/promises";
import { connectDB } from "../backend/config/db.js";
import Settings from "../backend/models/Settings.js";
import Sale from "../backend/models/Sale.js";
import Payment from "../backend/models/Payment.js";
import Customer from "../backend/models/Customer.js";
import { receiptNumber } from "../backend/utils/billNumber.js";
import { transaction } from "../backend/services/transaction.js";
try {
  await connectDB(process.env.MYSQL_URL);
  await transaction(async (session) => {
    const settings = await Settings.findByIdAndUpdate(
      "store",
      { $inc: { revision: 1 } },
      { new: true, session },
    );
    if (
      (await Sale.exists({
        idempotencyKey: { $not: /^seed-sale-\d+$/ },
      }).session(session)) ||
      (await Payment.exists({
        idempotencyKey: { $not: /^seed-payment-\d+$/ },
      }).session(session))
    )
      throw new Error(
        "Refusing to relabel real financial records. Only an untouched demo ledger is eligible.",
      );
    const sales = await Sale.find().session(session).lean(),
      payments = await Payment.find().session(session).lean();
    await mkdir(".data/backups", { recursive: true });
    const backup = `.data/backups/demo-before-usd-${Date.now()}.json`;
    await writeFile(
      backup,
      JSON.stringify({ settings, sales, payments }, null, 2),
      { flag: "wx" },
    );
    settings.storeName = "فرش و قالین فروشی";
    settings.currency = "USD";
    await settings.save({ session });
    await Sale.updateMany({}, { $set: { currency: "USD" } }, { session });
    for (const payment of payments) {
      const customer = await Customer.findById(payment.customerId).session(
        session,
      );
      await Payment.updateOne(
        { _id: payment._id },
        {
          $set: {
            currency: "USD",
            receiptNumber:
              payment.receiptNumber || (await receiptNumber(session)),
            customerName: payment.customerName ?? customer?.name,
            customerPhone: payment.customerPhone ?? customer?.phone,
            customerAddress: payment.customerAddress ?? customer?.address,
          },
        },
        { session },
      );
    }
    console.log(`Configured USD demo and store name. Backup: ${backup}`);
  });
} finally {
  await database.disconnect();
}
