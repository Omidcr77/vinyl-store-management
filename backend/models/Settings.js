import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    _id: { type: String, default: "store" },
    storeName: { type: String, default: "فرش و قالین فروشی" },
    storeAddress: { type: String, default: "" },
    phone: { type: String, default: "" },
    currency: { type: String, default: "USD" },
    calendar: { type: String, enum: ["gregory", "persian"], default: "gregory" },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    defaultVinylWidth: { type: Number, default: 4, min: 0.001 },
    invoiceFooter: { type: String, default: "از خرید شما سپاسگزاریم." },
    revision: { type: Number, default: 0 },
    sessionTimeoutMinutes: { type: Number, default: 480, min: 5, max: 10080 },
  },
  { timestamps: true },
);
export default mongoose.model("Settings", schema);
