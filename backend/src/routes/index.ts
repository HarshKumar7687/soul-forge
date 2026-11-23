import { Router } from "express";
import { authRouter } from "./auth";
import { characterRouter } from "./character";
import { conversationRouter } from "./conversation";
import { favoriteRouter } from "./favorite";
import { memoryRouter } from "./memory";
import { storyRouter } from "./story";
import { requireAuth } from "../middleware/auth";
import { status as aiStatus } from "../controllers/ai";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.json({ ok: true }));
apiRouter.use("/auth", authRouter);
apiRouter.use("/characters", characterRouter);
apiRouter.use("/conversations", conversationRouter);
apiRouter.get("/ai/status", requireAuth, aiStatus);
apiRouter.use("/memories", memoryRouter);
apiRouter.use("/stories", storyRouter);
apiRouter.use("/favorites", favoriteRouter);
