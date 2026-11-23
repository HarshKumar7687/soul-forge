export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = "error",
    public details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
  static badRequest(msg: string, details?: unknown) { return new AppError(400, msg, "bad_request", details); }
  static unauthorized(msg = "Please sign in to continue") { return new AppError(401, msg, "unauthorized"); }
  static forbidden(msg = "You do not have access to this resource") { return new AppError(403, msg, "forbidden"); }
  static notFound(msg = "Not found") { return new AppError(404, msg, "not_found"); }
  static conflict(msg: string) { return new AppError(409, msg, "conflict"); }
}
