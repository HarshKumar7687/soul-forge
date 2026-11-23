import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "./config/env";
import { errorHandler, notFound } from "./middleware/error";
import { apiLimiter } from "./middleware/rateLimit";
import { sameOrigin } from "./middleware/sameOrigin";
import { apiRouter } from "./routes";
import { UPLOAD_DIR } from "./services/uploads";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(
    "/uploads",
    express.static(UPLOAD_DIR, {
      index: false,
      dotfiles: "deny",
      setHeaders: (res) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      },
    })
  );
  app.use("/api", sameOrigin, apiLimiter, apiRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
