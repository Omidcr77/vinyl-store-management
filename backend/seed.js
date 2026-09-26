import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import VinylRoll from "./models/VinylRoll.js";
import Customer from "./models/Customer.js";
import Sale from "./models/Sale.js";
import Payment from "./models/Payment.js";
import Settings from "./models/Settings.js";
import { saveRoll } from "./services/inventoryService.js";
import { createSale } from "./services/saleService.js";
import { createPayment } from "./services/paymentService.js";
process.env.TZ ||= "Asia/Kabul";
export async function seed() {
  if (
    (await VinylRoll.exists({})) ||
    (await Customer.exists({})) ||
    (await Sale.exists({})) ||
    (await Payment.exists({}))
  )
    throw new Error(
      "Seed requires an empty database. Existing data has not been changed.",
    );
  await Settings.updateOne(
    { _id: "store" },
    {
      storeName: "فرش و قالین فروشی",
      storeAddress: "Kabul, Afghanistan",
      phone: "+93 700 123 456",
      currency: "USD",
    },
  );
  const customers = await Customer.create([
    {
      name: "Ahmad Karimi",
      phone: "+93 700 234 567",
      address: "Shahr-e Naw, Kabul",
    },
    {
      name: "Sara Ahmadi",
      phone: "+93 790 345 678",
      address: "Karte Parwan, Kabul",
    },
    {
      name: "Omid Construction",
      phone: "+93 780 456 789",
      address: "Taimani, Kabul",
    },
    {
      name: "Farid Rahimi",
      phone: "+93 770 567 890",
      address: "Karte Se, Kabul",
    },
    {
      name: "Nadia Interiors",
      phone: "+93 720 678 901",
      address: "Wazir Akbar Khan, Kabul",
    },
  ]);
  const names = [
    "Turkish Oak",
    "Gray Marble",
    "Classic Walnut",
    "White Stone",
    "Golden Oak",
    "Dark Wood",
    "Concrete Gray",
    "Natural Ash",
    "Travertine Beige",
    "Nordic Pine",
    "Smoked Oak",
    "Ivory Marble",
    "Honey Maple",
    "Rustic Cedar",
    "Silver Concrete",
  ];
  const colors = [
    "Natural oak",
    "Cool gray",
    "Walnut brown",
    "Ivory",
    "Golden brown",
    "Dark brown",
    "Slate",
    "Light ash",
    "Sand",
    "Pale pine",
    "Smoked brown",
    "White",
    "Honey",
    "Warm brown",
    "Silver",
  ];
  const rolls = [];
  for (let i = 0; i < names.length; i++) {
    const type = [1, 3, 8, 11].includes(i)
      ? "Stone"
      : [6, 14].includes(i)
        ? "Concrete"
        : "Wood";
    const entryDate = new Date();
    entryDate.setDate(entryDate.getDate() - 20 + i);
    rolls.push(
      await saveRoll({
        vinylName: names[i],
        type,
        color: colors[i],
        length: [30, 25, 35, 22, 30, 18, 32, 28, 20, 25, 24, 30, 35, 22, 18][i],
        width: i % 4 === 0 ? 3 : 4,
        costPrice: 180 + i * 10,
        sellingPrice: 300 + i * 15,
        supplier: i % 2 ? "Kabul Flooring Supply" : "Anatolia Floors",
        entryDate,
        details: "Durable residential vinyl flooring. Price per linear meter.",
      }),
    );
  }
  for (let i = 0; i < 10; i++) {
    const soldDate = new Date();
    soldDate.setDate(soldDate.getDate() - (i % 7));
    const soldLength = i === 0 ? 27 : i === 1 ? 21 : i === 2 ? 31 : 3 + (i % 4);
    const total = soldLength * rolls[i].sellingPrice;
    await createSale(
      {
        vinylId: rolls[i]._id.toString(),
        customerId: customers[i % 5]._id.toString(),
        soldLength,
        pricingMethod: "linear",
        unitPrice: rolls[i].sellingPrice,
        paidAmount: i % 3 === 0 ? total : Math.round(total * 0.5),
        soldDate,
        notes: i % 2 ? "Residential flooring order" : "Collected in store",
      },
      `seed-sale-${i}`,
    );
  }
  for (let i = 0; i < 3; i++) {
    const customer = await Customer.findById(customers[i]._id);
    if (customer.balance > 0)
      await createPayment(
        {
          customerId: customer._id.toString(),
          amount: Math.min(500, customer.balance),
          paymentMethod: "cash",
          date: new Date(),
          details: "Payment received in store",
          reference: `SEED-${i + 1}`,
        },
        `seed-payment-${i}`,
      );
  }
  console.log("Seeded 15 rolls, 5 customers, 10 sales and 3 payments.");
}
try {
  await connectDB(
    process.env.MONGO_URI ||
      "mongodb://127.0.0.1:27017/vinyl_store?replicaSet=rs0",
  );
  await seed();
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
