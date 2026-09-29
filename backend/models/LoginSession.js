import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    _id: String,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    authVersion: Number,
    csrf: String,
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true },
);
export default mongoose.model("LoginSession", schema);
