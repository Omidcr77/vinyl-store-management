import Counter from "../models/Counter.js";
export async function nextSequence(name, session) {
  const counter = await Counter.findByIdAndUpdate(
    name,
    { $inc: { value: 1 } },
    { new: true, upsert: true, session },
  );
  return counter.value;
}
export async function billNumber(session) {
  const year = new Date().getFullYear();
  return `INV-${year}-${String(await nextSequence(`invoice-${year}`, session)).padStart(6, "0")}`;
}
export async function receiptNumber(session) {
  const year = new Date().getFullYear();
  return `RCP-${year}-${String(await nextSequence(`receipt-${year}`, session)).padStart(6, "0")}`;
}
