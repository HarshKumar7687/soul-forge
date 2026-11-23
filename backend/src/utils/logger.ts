const SECRET_KEYS = /(password|token|secret|authorization|api[_-]?key|cookie)/i;

function redact(value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        SECRET_KEYS.test(k) ? "[redacted]" : redact(v),
      ])
    );
  }
  return value;
}

function log(level: string, msg: string, meta?: unknown) {
  if (process.env.NODE_ENV === "test") return;
  const line = { time: new Date().toISOString(), level, msg, ...(meta ? { meta: redact(meta) } : {}) };
  (level === "error" ? console.error : console.log)(JSON.stringify(line));
}

export const logger = {
  info: (msg: string, meta?: unknown) => log("info", msg, meta),
  warn: (msg: string, meta?: unknown) => log("warn", msg, meta),
  error: (msg: string, meta?: unknown) => log("error", msg, meta),
};
