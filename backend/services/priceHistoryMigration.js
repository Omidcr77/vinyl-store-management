import Sale from "../models/Sale.js";
import CustomerPriceHistory from "../models/CustomerPriceHistory.js";
// Preserve existing bill prices when upgrading; no amounts or original bills change.
export async function migratePriceHistory(session) {
  for await (const sale of Sale.find({ customerId: { $ne: null } })
    .session(session || null)
    .lean()
    .cursor()) {
    const rows = sale.items?.length ? sale.items : [sale];
    await CustomerPriceHistory.bulkWrite(
      rows.map((item, itemIndex) => ({
        updateOne: {
          filter: { saleId: sale._id, itemIndex },
          update: {
            $setOnInsert: {
              saleId: sale._id,
              itemIndex,
              customerId: sale.customerId,
              type: item.type,
              color: item.color,
              width: item.width,
              pricingMethod: item.pricingMethod,
              unitPrice: item.pricePerMeter ?? item.pricePerSquareMeter,
              currency: sale.currency,
              source: "sale",
              billNumber: sale.billNumber,
              createdAt: sale.createdAt || sale.soldDate,
              updatedAt: sale.createdAt || sale.soldDate,
              createdBy: sale.createdBy,
              createdByName: sale.createdByName,
              voided: false,
            },
          },
          upsert: true,
          timestamps: false,
        },
      })),
      { session },
    );
  }
}
