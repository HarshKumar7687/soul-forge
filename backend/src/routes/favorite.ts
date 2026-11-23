import { Router } from "express";
import * as c from "../controllers/favorite";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { asyncHandler as h } from "../utils/asyncHandler";
import { favoriteSchema } from "../validators/discovery";

export const favoriteRouter = Router();
favoriteRouter.use(requireAuth);
favoriteRouter.get("/", h(async (q, s) => c.list(q, s)));
favoriteRouter.post("/", validateBody(favoriteSchema), h(async (q, s) => c.add(q, s)));
favoriteRouter.delete("/:characterId", h(async (q, s) => c.remove(q, s)));
