export class AppError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const validationError = (fields, message = "Please correct the highlighted fields") =>
  new AppError(400, "VALIDATION_ERROR", message, fields);

export const notFound = (message = "Resource not found") =>
  new AppError(404, "NOT_FOUND", message);
