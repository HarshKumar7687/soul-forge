import { Router } from "express";
import * as c from "../controllers/memory";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { asyncHandler as h } from "../utils/asyncHandler";
import { createMemorySchema, updateMemorySchema } from "../validators/memory";

export const memoryRouter = Router();
memoryRouter.use(requireAuth);
memoryRouter.get("/", h(async (q, s) => c.list(q, s)));
memoryRouter.post("/", validateBody(createMemorySchema), h(async (q, s) => c.create(q, s)));
memoryRouter.patch("/:id", validateBody(updateMemorySchema), h(async (q, s) => c.update(q, s)));
memoryRouter.delete("/:id", h(async (q, s) => c.remove(q, s)));
