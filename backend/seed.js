import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import User from "./models/User.js";
import { bootstrapAdmin } from "./services/authService.js";
dotenv.config({
  path: fileURLToPath(new URL(".env", import.meta.url)),
  quiet: true,
});
import database from "./db/mysql.js";
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
  return database.connection.transaction(async () => {
    if (
      (await VinylRoll.exists({})) ||
      (await Customer.exists({})) ||
      (await Sale.exists({})) ||
      (await Payment.exists({}))
    )
      throw new Error(
        "Seed requires an empty database. Existing data has not been changed.",
      );
    if (!(await User.exists({}))) {
      if (!process.env.ADMIN_PASSWORD)
        throw new Error(
          "Set ADMIN_PASSWORD privately before seeding a fresh store (12–128 characters).",
        );
      await bootstrapAdmin({
        username: "admin",
        name: "مدیر سیستم",
        password: process.env.ADMIN_PASSWORD,
      });
    }
    await Settings.updateOne(
      { _id: "store" },
      {
        storeName: "فرش و قالین فروشی",
        storeAddress: "کابل، افغانستان",
        phone: "+93 700 123 456",
        currency: "AFN",
      },
    );
    const customers = await Customer.create([
      {
        name: "احمد کریمی",
        phone: "+93 700 234 567",
        address: "شهر نو، کابل",
      },
      {
        name: "سارا احمدی",
        phone: "+93 790 345 678",
        address: "کارته پروان، کابل",
      },
      {
        name: "شرکت ساختمانی امید",
        phone: "+93 780 456 789",
        address: "تایمنی، کابل",
      },
      {
        name: "فرید رحیمی",
        phone: "+93 770 567 890",
        address: "کارته سه، کابل",
      },
      {
        name: "شرکت دکوراسیون نادیا",
        phone: "+93 720 678 901",
        address: "وزیر اکبر خان، کابل",
      },
    ]);
    const names = [
      "بلوط ترکی",
      "مرمر خاکستری",
      "چهارمغز کلاسیک",
      "سنگ سفید",
      "بلوط طلایی",
      "چوب تیره",
      "کانکریت خاکستری",
      "چوب طبیعی",
      "سنگ کرمی",
      "کاج روشن",
      "بلوط دودی",
      "مرمر عاجی",
      "افرا عسلی",
      "سدر طبیعی",
      "کانکریت نقره‌ای",
    ];
    const colors = [
      "بلوط طبیعی",
      "خاکستری",
      "نسواری چهارمغز",
      "عاجی",
      "نسواری طلایی",
      "نسواری تیره",
      "خاکستری تیره",
      "چوب روشن",
      "ریگی",
      "کاج کم‌رنگ",
      "نسواری دودی",
      "سفید",
      "عسلی",
      "نسواری",
      "نقره‌ای",
    ];
    const rolls = [];
    for (let i = 0; i < names.length; i++) {
      const type = [1, 3, 8, 11].includes(i)
        ? "سنگ"
        : [6, 14].includes(i)
          ? "کانکریت"
          : "چوب";
      const entryDate = new Date();
      entryDate.setDate(entryDate.getDate() - 20 + i);
      rolls.push(
        await saveRoll({
          vinylName: names[i],
          type,
          color: colors[i],
          length: [30, 25, 35, 22, 30, 18, 32, 28, 20, 25, 24, 30, 35, 22, 18][
            i
          ],
          width: i % 4 === 0 ? 3 : 4,
          costPrice: 180 + i * 10,
          sellingPrice: 300 + i * 15,
          supplier: i % 2 ? "شرکت قالین و فرش کابل" : "تجارت قالین بلخ",
          entryDate,
          details: "فرش وینیل مقاوم برای خانه و دفتر. قیمت فی متر طول.",
        }),
      );
    }
    for (let i = 0; i < 10; i++) {
      const soldDate = new Date();
      soldDate.setDate(soldDate.getDate() - (i % 7));
      const soldLength =
        i === 0 ? 27 : i === 1 ? 21 : i === 2 ? 31 : 3 + (i % 4);
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
          notes: i % 2 ? "سفارش فرش برای خانه" : "تحویل در دکان",
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
            details: "پرداخت نقدی در دکان",
            reference: `SEED-${i + 1}`,
          },
          `seed-payment-${i}`,
        );
    }
    console.log(
      `Seeded 15 rolls, 5 customers, 10 sales and ${await Payment.countDocuments()} payments; currency AFN.`,
    );
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await connectDB(process.env.MYSQL_URL);
    await seed();
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await database.disconnect();
  }
}
