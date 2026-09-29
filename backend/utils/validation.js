import { z } from "zod";
const text = z.string().trim().max(200);
const positive = z.number().finite().positive().max(1000000).multipleOf(0.001);
const price = z.number().finite().min(0).max(100000000).multipleOf(0.01);
const image = z.union([
  z.literal(""),
  z.string().regex(/^\/api\/images\/[a-f0-9-]{36}\.webp$/),
  z
    .url()
    .max(2000)
    .regex(/^https?:\/\//, "آدرس عکس معتبر نیست."),
]);
export const id = z.string().regex(/^[a-f\d]{24}$/i, "شناسهٔ مورد معتبر نیست.");
const date = z.iso
  .datetime({ offset: true })
  .or(z.iso.date())
  .transform((v) => new Date(v));
export const rollInput = z.object({
  vinylName: text.min(1),
  type: text.min(1),
  color: text.min(1),
  length: positive,
  width: positive,
  entryDate: date.optional(),
  details: z.string().max(3000).default(""),
  costPrice: price.optional(),
  importCost: price.optional(),
  supplierId: id.optional(),
  paidAmount: price.optional(),
  sellingPrice: price.optional(),
  supplier: text.optional(),
  img: image.optional(),
});
export const rollEditInput = rollInput.extend({
  length: positive.or(z.literal(0)),
});
export const deliveryRowInput = rollInput
  .omit({
    entryDate: true,
    supplier: true,
    supplierId: true,
    paidAmount: true,
    length: true,
  })
  .extend({
    length: positive.optional(),
    quantity: z.number().int().min(1).max(1000).optional(),
    lengths: z.array(positive).min(1).max(1000).optional(),
  })
  .superRefine((row, ctx) => {
    if (row.lengths) {
      if (row.length !== undefined || row.quantity !== undefined)
        ctx.addIssue({
          code: "custom",
          message: "لیست طول‌ها را بدون تعداد و طول یکسان وارد کنید.",
        });
    } else if (row.length === undefined || row.quantity === undefined) {
      ctx.addIssue({ code: "custom", message: "طول و تعداد را وارد کنید." });
    }
  });
export const deliveryInput = z
  .object({
    supplier: text.default(""),
    supplierId: id.optional(),
    paidAmount: price.default(0),
    reference: text.default(""),
    entryDate: date,
    rows: z.array(deliveryRowInput).min(1).max(200),
  })
  .superRefine((data, ctx) => {
    if (
      data.rows.reduce(
        (sum, row) => sum + (row.lengths?.length || row.quantity || 0),
        0,
      ) > 1000
    )
      ctx.addIssue({
        code: "custom",
        message: "هر بار حداکثر 1000 رول ثبت کنید.",
      });
  });
export const customerInput = z.object({
  name: text.min(1),
  phone: text.min(1),
  address: z.string().trim().max(500).default(""),
  img: image.optional(),
});
const legacySaleInput = z.object({
  vinylId: id,
  customerId: id.optional(),
  soldLength: positive,
  pricingMethod: z.enum(["linear", "area"]),
  unitPrice: price.refine((v) => v > 0, "قیمت باید بیشتر از صفر باشد."),
  paidAmount: price,
  soldDate: date.optional(),
  notes: z.string().max(3000).default(""),
  rememberPrice: z.boolean().optional(),
});
const saleItemInput = legacySaleInput.pick({
  vinylId: true,
  soldLength: true,
  pricingMethod: true,
  unitPrice: true,
  rememberPrice: true,
});
export const saleInput = z.union([
  legacySaleInput.extend({ items: z.never().optional() }),
  legacySaleInput
    .omit({
      vinylId: true,
      soldLength: true,
      pricingMethod: true,
      unitPrice: true,
      rememberPrice: true,
    })
    .extend({
      items: z.array(saleItemInput).min(1).max(100),
      vinylId: z.never().optional(),
      soldLength: z.never().optional(),
      pricingMethod: z.never().optional(),
      unitPrice: z.never().optional(),
      rememberPrice: z.never().optional(),
    }),
]);
export const customerPriceInput = z.object({
  type: text.min(1),
  pricingMethod: z.enum(["linear", "area"]),
  unitPrice: price.refine((v) => v > 0, "قیمت باید بیشتر از صفر باشد."),
});
export const paymentInput = z.object({
  customerId: id,
  amount: price.refine((v) => v > 0, "مبلغ پرداخت باید بیشتر از صفر باشد."),
  date: date.optional(),
  details: z.string().max(3000).default(""),
  paymentMethod: z.enum(["cash", "bank", "other"]),
  reference: text.default(""),
});
export const settingsInput = z.object({
  sessionTimeoutMinutes: z.number().int().min(5).max(10080).optional(),
  calendar: z.enum(["gregory", "persian"]).optional(),
  storeName: text.min(1),
  storeAddress: z.string().max(500),
  phone: text,
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .refine((v) => {
      try {
        return Intl.supportedValuesOf("currency").includes(v);
      } catch {
        return false;
      }
    }, "کُد معتبر واحد پول را وارد کنید."),
  lowStockThreshold: z.number().min(0).max(100000).multipleOf(0.001),
  defaultVinylWidth: positive,
  invoiceFooter: z.string().max(500),
});
export const keyInput = z.string().min(8).max(100);

export const supplierInput = z.object({
  name: text.min(1),
  phone: text.default(""),
  address: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(3000).default(""),
});
export const supplierEntryInput = z.object({
  kind: z.enum([
    "payment",
    "receipt",
    "loan_given",
    "loan_received",
    "opening_payable",
    "opening_receivable",
    "adjust_payable",
    "adjust_receivable",
  ]),
  amount: price.refine((v) => v > 0, "مبلغ باید بیشتر از صفر باشد."),
  date: date.optional(),
  reference: text.default(""),
  details: z.string().trim().min(1).max(3000),
  paymentMethod: z.enum(["cash", "bank", "other"]).default("cash"),
});
export const supplierReversalInput = z.object({
  details: z.string().trim().min(1).max(3000),
});
