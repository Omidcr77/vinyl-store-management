import { migratePriceHistory } from "../services/priceHistoryMigration.js";
import Supplier from "../models/Supplier.js";
import SupplierEntry from "../models/SupplierEntry.js";
import CustomerPriceHistory from "../models/CustomerPriceHistory.js";
import DeletedRecord from "../models/DeletedRecord.js";
import database from "../db/mysql.js";
import Settings from "../models/Settings.js";
import VinylRoll from "../models/VinylRoll.js";
import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import Payment from "../models/Payment.js";
import Counter from "../models/Counter.js";
import CustomerPrice from "../models/CustomerPrice.js";
import Delivery from "../models/Delivery.js";
import User from "../models/User.js";
import LoginSession from "../models/LoginSession.js";
import AuditEvent from "../models/AuditEvent.js";
import AuthGuard from "../models/AuthGuard.js";
export async function connectDB(uri) {
  await database.connect(uri || process.env.MYSQL_URL);
  await Promise.all(
    [
      DeletedRecord,
      Supplier,
      SupplierEntry,
      CustomerPriceHistory,
      Settings,
      VinylRoll,
      Customer,
      Sale,
      Payment,
      Counter,
      CustomerPrice,
      Delivery,
      User,
      LoginSession,
      AuditEvent,
      AuthGuard,
    ].map((model) => model.init()),
  );
  await migratePriceHistory();
  await AuthGuard.updateOne(
    { _id: "users" },
    { $setOnInsert: { revision: 0 } },
    { upsert: true },
  );
  await Settings.updateOne(
    { _id: "store" },
    {
      $setOnInsert: {
        storeName: "فرش و قالین فروشی",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true, timestamps: false },
  );
}
