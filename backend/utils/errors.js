export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const required = (value, message = "مورد مورد نظر یافت نشد.") => {
  if (!value) throw new AppError(message, 404);
  return value;
};
