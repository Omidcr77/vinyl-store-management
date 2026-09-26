import mongoose from "mongoose";
import Settings from "../models/Settings.js";
import VinylRoll from "../models/VinylRoll.js";
import Customer from "../models/Customer.js";
import Sale from "../models/Sale.js";
import Payment from "../models/Payment.js";
import Counter from "../models/Counter.js";
import CustomerPrice from "../models/CustomerPrice.js";
export async function connectDB(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== "isdbgrid")
    throw new Error(
      "MongoDB must be a replica set for safe transactions. Run npm run db, or configure a replica set.",
    );
  await Promise.all(
    [Settings, VinylRoll, Customer, Sale, Payment, Counter, CustomerPrice].map(
      (model) => model.init(),
    ),
  );
  await Settings.updateOne(
    { _id: "store" },
    { $setOnInsert: { storeName: "فرش و قالین فروشی" } },
    { upsert: true },
  );
}
