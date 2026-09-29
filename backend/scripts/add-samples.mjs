import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Customer from "../models/Customer.js";
import User from "../models/User.js";
import VinylRoll from "../models/VinylRoll.js";
import Settings from "../models/Settings.js";
import { actorContext, actorFields } from "../services/actor.js";
import { transaction } from "../services/transaction.js";
import { createDelivery } from "../services/deliveryService.js";
import { createSale } from "../services/saleService.js";
import { createPayment } from "../services/paymentService.js";
import {
  deliveryInput,
  saleInput,
  paymentInput,
  customerInput,
} from "../utils/validation.js";
const batch = "samples-20260929-v1";
process.env.TZ ||= "Asia/Kabul";
try {
  await connectDB(
    process.env.MONGO_URI ||
      "mongodb://127.0.0.1:27017/vinyl_store?replicaSet=rs0",
  );
  const admin = await User.findOne({ role: "admin", active: true });
  if (!admin)
    throw new Error("An active administrator is required to add samples.");
  await actorContext.run({ user: admin, action: "sample.add" }, async () => {
    const names = [
      "احمد",
      "مریم",
      "شرکت آریا",
      "فرید",
      "دکان بهار",
      "مشتری آزمایشی بدون معامله",
    ];
    const customers = [];
    for (let i = 0; i < names.length; i++) {
      const data = customerInput.parse({
        name: `نمونه — ${names[i]}`,
        phone: `070000010${i}`,
        address: "کابل — معلومات نمونه",
      });
      let customer = await Customer.findOne({
        name: data.name,
        phone: data.phone,
      });
      if (!customer)
        customer = await transaction(
          async (session) =>
            (
              await Customer.create([{ ...data, ...actorFields(true) }], {
                session,
              })
            )[0],
        );
      customers.push(customer);
    }
    const entryDate = "2026-09-29";
    const delivery = await createDelivery(
      deliveryInput.parse({
        supplier: "تهیه‌کنندهٔ نمونه",
        reference: batch,
        entryDate,
        rows: [
          {
            vinylName: "نمونه — قالین ترکی",
            type: "قالین ترکی",
            color: "سرخ",
            width: 4,
            length: 30,
            quantity: 2,
            costPrice: 12,
            sellingPrice: 20,
          },
          {
            vinylName: "نمونه — فرش آبی",
            type: "فرش",
            color: "آبی",
            width: 3,
            length: 25,
            quantity: 2,
            costPrice: 10,
            sellingPrice: 15,
          },
          {
            vinylName: "نمونه — کفپوش چوبی",
            type: "کفپوش",
            color: "قهوه‌ای",
            width: 4,
            length: 20,
            quantity: 2,
            costPrice: 11,
            sellingPrice: 18,
          },
          {
            vinylName: "نمونه — قالین ساده",
            type: "قالین",
            color: "خاکستری",
            width: 4,
            length: 22,
            quantity: 2,
            costPrice: 13,
            sellingPrice: 19,
          },
        ],
      }),
      `${batch}-delivery`,
    );
    const rolls = await VinylRoll.find({ deliveryId: delivery._id }).sort({
      rollNumber: 1,
    });
    if (rolls.length !== 8) throw new Error("Sample delivery is incomplete.");
    const payment = (index, amount, key) =>
      createPayment(
        paymentInput.parse({
          customerId: String(customers[index]._id),
          amount,
          paymentMethod: "cash",
          date: entryDate,
          reference: `SAMPLE-${key}`,
          details: "رسید نمونه برای آزمایش برنامه",
        }),
        `${batch}-receipt-${key}`,
      );
    await payment(2, 100, "advance");
    const definitions = [
      {
        customerId: String(customers[0]._id),
        vinylId: String(rolls[0]._id),
        soldLength: 3,
        pricingMethod: "linear",
        unitPrice: 20,
        paidAmount: 60,
        rememberPrice: true,
      },
      {
        customerId: String(customers[1]._id),
        vinylId: String(rolls[1]._id),
        soldLength: 5,
        pricingMethod: "linear",
        unitPrice: 22,
        paidAmount: 30,
      },
      {
        customerId: String(customers[2]._id),
        vinylId: String(rolls[2]._id),
        soldLength: 4,
        pricingMethod: "linear",
        unitPrice: 15,
        paidAmount: 0,
      },
      {
        customerId: String(customers[3]._id),
        items: [
          {
            vinylId: String(rolls[3]._id),
            soldLength: 2,
            pricingMethod: "linear",
            unitPrice: 25,
          },
          {
            vinylId: String(rolls[4]._id),
            soldLength: 3,
            pricingMethod: "linear",
            unitPrice: 18,
          },
        ],
        paidAmount: 24,
      },
      {
        customerId: String(customers[4]._id),
        vinylId: String(rolls[5]._id),
        soldLength: 5,
        pricingMethod: "linear",
        unitPrice: 17,
        paidAmount: 0,
      },
      {
        vinylId: String(rolls[6]._id),
        soldLength: 2,
        pricingMethod: "linear",
        unitPrice: 19,
        paidAmount: 38,
      },
    ];
    for (const [i, definition] of definitions.entries())
      await createSale(
        saleInput.parse({
          ...definition,
          soldDate: entryDate,
          notes: "فروش نمونه برای آزمایش برنامه",
        }),
        `${batch}-sale-${i}`,
      );
    await payment(1, 40, "partial");
    await payment(3, 30, "basket");
    const balances = await Customer.find({
      _id: { $in: customers.map((c) => c._id) },
    }).select("name balanceMinor");
    console.log(
      JSON.stringify(
        {
          customers: 6,
          rolls: 8,
          sales: 6,
          receipts: 3,
          deliveries: 1,
          currency: (await Settings.findById("store")).currency,
          balances: balances.map((c) => ({
            name: c.name,
            balance: c.balanceMinor / 100,
          })),
        },
        null,
        2,
      ),
    );
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
