import { formatDate, dateText } from "../../../shared/calendar.js";
export const number = (value) =>
  Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 3 });
export const date = formatDate;
export const paymentMethod = (value) =>
  ({ cash: "نقد", bank: "بانک", other: "سایر" })[value] || value;
export const customerName = (value) =>
  value === "Walk-in customer" ? "مشتری گذری" : value;
export const invoiceFooter = (value) =>
  value === "Thank you for choosing us." ? "از خرید شما سپاسگزاریم." : value;
export const today = () => dateText(new Date(), "gregory").replaceAll("/", "-");
export function formValues(form, numeric = []) {
  const values = Object.fromEntries(new FormData(form));
  for (const key of numeric) {
    if (values[key] === "") delete values[key];
    else if (values[key] !== undefined) values[key] = Number(values[key]);
  }
  return values;
}
