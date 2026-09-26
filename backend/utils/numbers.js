import Decimal from "decimal.js";
export const money = (value) =>
  new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
export const minor = (value) =>
  new Decimal(value)
    .times(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
export const quantity = (value) =>
  new Decimal(value).toDecimalPlaces(3).toNumber();
export const multiply = (a, b) => new Decimal(a).times(b).toNumber();
export const subtract = (a, b) => new Decimal(a).minus(b).toNumber();
