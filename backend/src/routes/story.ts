import { Router } from "express";
import * as c from "../controllers/story";
import { requireAuth } from "../middleware/auth";
import { chatLimiter } from "../middleware/rateLimit";
import { validateBody } from "../middleware/validate";
import { asyncHandler as h } from "../utils/asyncHandler";
import { addStoryCharacterSchema, continueStorySchema, createStorySchema } from "../validators/story";

export const storyRouter = Router();
storyRouter.use(requireAuth);
storyRouter.get("/", h(async (q, s) => c.list(q, s)));
storyRouter.post("/", validateBody(createStorySchema), h(async (q, s) => c.create(q, s)));
storyRouter.get("/:id", h(async (q, s) => c.get(q, s)));
storyRouter.get("/:id/scenes", h(async (q, s) => c.scenes(q, s)));
storyRouter.delete("/:id", h(async (q, s) => c.remove(q, s)));
storyRouter.post("/:id/continue", chatLimiter, validateBody(continueStorySchema), h(async (q, s) => c.continueStory(q, s)));
storyRouter.post("/:id/characters", validateBody(addStoryCharacterSchema), h(async (q, s) => c.addCharacter(q, s)));
storyRouter.delete("/:id/characters/:characterId", h(async (q, s) => c.removeCharacter(q, s)));
