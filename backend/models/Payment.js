import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    receiptNumber: { type: String, unique: true, sparse: true },
    customerName: String,
    customerPhone: String,
    customerAddress: String,
    currency: String,
    balanceBefore: Number,
    balanceAfter: Number,
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    date: { type: Date, default: Date.now, index: true },
    details: String,
    paymentMethod: {
      type: String,
      enum: ["cash", "bank", "other"],
      default: "cash",
    },
    reference: String,
    allocations: [
      {
        _id: false,
        saleId: { type: mongoose.Schema.Types.ObjectId, ref: "Sale" },
        amount: Number,
      },
    ],
    idempotencyKey: { type: String, required: true, unique: true },
    requestHash: String,
  },
  { timestamps: true },
);
export default mongoose.model("Payment", schema);
