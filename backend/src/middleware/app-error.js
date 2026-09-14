class AppError extends Error {
  constructor(statusCode, message, code = "APP_ERROR") {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

module.exports = { AppError };
