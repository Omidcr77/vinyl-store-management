import database from "../db/mysql.js";
import { actorSchema } from "../services/actor.js";
const schema = new database.Schema(
  {
    ...actorSchema,
    supplierId: {
      type: database.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    kind: {
      type: String,
      required: true,
      enum: [
        "purchase",
        "payment",
        "receipt",
        "loan_given",
        "loan_received",
        "opening_payable",
        "opening_receivable",
        "adjust_payable",
        "adjust_receivable",
        "reversal",
      ],
    },
    amount: { type: Number, required: true, min: 0 },
    deltaMinor: {
      type: Number,
      required: true,
      validate: Number.isSafeInteger,
    },
    balanceAfter: Number,
    currency: { type: String, required: true },
    date: { type: Date, default: Date.now, index: true },
    reference: String,
    details: String,
    paymentMethod: String,
    deliveryId: { type: database.Schema.Types.ObjectId, ref: "Delivery" },
    vinylId: { type: database.Schema.Types.ObjectId, ref: "VinylRoll" },
    reversalOf: {
      type: database.Schema.Types.ObjectId,
      ref: "SupplierEntry",
      unique: true,
      sparse: true,
    },
    reversed: { type: Boolean, default: false },
    idempotencyKey: { type: String, unique: true, sparse: true },
    requestHash: String,
  },
  { timestamps: true },
);
export default database.model("SupplierEntry", schema);
