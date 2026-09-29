import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "manager", "staff"], required: true },
    active: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: true },
    authVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
  },
  { timestamps: true },
);
export default mongoose.model("User", schema);
