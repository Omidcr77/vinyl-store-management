import database from "../db/mysql.js";
import Sale from "../models/Sale.js";
import VinylRoll from "../models/VinylRoll.js";
import Customer from "../models/Customer.js";
import Payment from "../models/Payment.js";
import Settings from "../models/Settings.js";
import { monthStart } from "../../shared/calendar.js";
import { filterFor, pagination } from "../utils/query.js";
const sum = (field) => ({ $sum: `$${field}` });
export async function salesSummary(filter = {}) {
  if (filter.customerId)
    filter = {
      ...filter,
      customerId: new database.Types.ObjectId(filter.customerId),
    };
  const [result] = await Sale.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        totalSales: sum("totalAmount"),
        costAmount: sum("costAmount"),
        grossProfit: sum("grossProfit"),
        uncostedSales: {
          $sum: { $cond: [{ $eq: ["$costKnown", true] }, 0, 1] },
        },
        initialPaid: sum("paidAmount"),
        outstanding: sum("remainingBalance"),
        metersSold: sum("soldLength"),
        areaSold: sum("area"),
      },
    },
    {
      $project: {
        _id: 0,
        count: 1,
        costAmount: { $round: ["$costAmount", 2] },
        grossProfit: { $round: ["$grossProfit", 2] },
        uncostedSales: 1,
        totalSales: { $round: ["$totalSales", 2] },
        totalPaid: {
          $round: [{ $subtract: ["$totalSales", "$outstanding"] }, 2],
        },
        initialPaid: { $round: ["$initialPaid", 2] },
        outstanding: { $round: ["$outstanding", 2] },
        metersSold: { $round: ["$metersSold", 3] },
        areaSold: { $round: ["$areaSold", 3] },
      },
    },
  ]);
  return (
    result || {
      count: 0,
      costAmount: 0,
      grossProfit: 0,
      uncostedSales: 0,
      totalSales: 0,
      totalPaid: 0,
      initialPaid: 0,
      outstanding: 0,
      metersSold: 0,
      areaSold: 0,
    }
  );
}
export async function inventorySummary(filter = { archived: false }) {
  const [result] = await VinylRoll.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        availableRolls: { $sum: { $cond: [{ $gt: ["$length", 0] }, 1, 0] } },
        remainingMeters: sum("length"),
        remainingArea: { $sum: { $multiply: ["$length", "$width"] } },
        inventoryValue: {
          $sum: {
            $multiply: [
              "$length",
              {
                $ifNull: [
                  "$landedCostPerMeter",
                  { $ifNull: ["$costPrice", 0] },
                ],
              },
            ],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        availableRolls: 1,
        remainingMeters: { $round: ["$remainingMeters", 3] },
        remainingArea: { $round: ["$remainingArea", 3] },
        inventoryValue: { $round: ["$inventoryValue", 2] },
      },
    },
  ]);
  return (
    result || {
      availableRolls: 0,
      remainingMeters: 0,
      remainingArea: 0,
      inventoryValue: 0,
    }
  );
}
export function customerPipeline(filter) {
  return [
    { $match: filter },
    {
      $lookup: {
        from: "sales",
        let: { customer: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$customerId", "$$customer"] } } },
          {
            $group: {
              _id: null,
              totalPurchases: sum("totalAmount"),
              remaining: sum("remainingBalance"),
            },
          },
        ],
        as: "totals",
      },
    },
    {
      $set: {
        totalPurchases: { $ifNull: [{ $first: "$totals.totalPurchases" }, 0] },
        balance: { $divide: ["$balanceMinor", 100] },
      },
    },
    {
      $set: {
        totalPaid: {
          $round: [{ $subtract: ["$totalPurchases", "$balance"] }, 2],
        },
      },
    },
    { $unset: ["totals", "balanceMinor"] },
  ];
}
export async function customerReport(q) {
  const filter = filterFor("customers", { archived: "all", ...q }),
    { page, limit } = pagination(q);
  const [items, total] = await Promise.all([
    Customer.aggregate([
      ...customerPipeline(filter),
      { $sort: { balance: -1, _id: 1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]),
    Customer.countDocuments(filter),
  ]);
  return {
    items,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}
export async function dashboard() {
  const calendar =
    (await Settings.findById("store").lean())?.calendar || "gregory";
  const now = new Date(),
    today = new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
    month = new Date(`${monthStart(now, calendar)}T00:00:00+04:30`),
    nextMonth = new Date(
      `${monthStart(new Date(month.getTime() + 32 * 86400000), calendar)}T00:00:00+04:30`,
    );
  const [
    inventory,
    revenue,
    todaySales,
    monthSales,
    debt,
    customers,
    recentSales,
    lowStock,
    trend,
  ] = await Promise.all([
    inventorySummary(),
    salesSummary(),
    salesSummary({ soldDate: { $gte: today, $lt: tomorrow } }),
    salesSummary({ soldDate: { $gte: month, $lt: nextMonth } }),
    Customer.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: { $max: ["$balanceMinor", 0] } },
          credit: { $sum: { $max: [{ $multiply: ["$balanceMinor", -1] }, 0] } },
        },
      },
    ]),
    Customer.countDocuments(),
    Sale.find().sort({ soldDate: -1 }).limit(6),
    VinylRoll.find({ archived: false, status: "low-stock" })
      .sort({ length: 1 })
      .limit(5),
    Sale.aggregate([
      {
        $match: {
          soldDate: {
            $gte: new Date(today.getTime() - 6 * 86400000),
            $lt: tomorrow,
          },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$soldDate",
              timezone: process.env.TZ || "Asia/Kabul",
            },
          },
          total: sum("totalAmount"),
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);
  return {
    ...inventory,
    totalRevenue: revenue.totalSales,
    todaySales: todaySales.totalSales,
    monthSales: monthSales.totalSales,
    outstandingDebt: (debt[0]?.total || 0) / 100,
    customerCredit: (debt[0]?.credit || 0) / 100,
    customers,
    recentSales,
    lowStock,
    trend,
  };
}
export async function customerDetail(customer, q) {
  const customerId = customer._id;
  const { list } = await import("../utils/query.js");
  const [purchases, receipts, totals, paid] = await Promise.all([
    list(Sale, { customerId }, { ...q, page: q.purchasePage || 1 }, [
      "soldDate",
    ]),
    list(Payment, { customerId }, { ...q, page: q.paymentPage || 1 }, ["date"]),
    salesSummary({ customerId }),
    Payment.aggregate([
      { $match: { customerId } },
      { $group: { _id: null, total: sum("amount") } },
    ]),
  ]);
  return {
    customer,
    purchases,
    receipts,
    summary: {
      totalPurchases: totals.totalSales,
      totalPayments: totals.initialPaid + (paid[0]?.total || 0),
      balance: customer.balance,
    },
  };
}
