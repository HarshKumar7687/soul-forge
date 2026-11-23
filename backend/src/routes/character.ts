import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import * as c from "../controllers/character";
import { optionalAuth, requireAuth } from "../middleware/auth";
import { imageLimiter, reportLimiter } from "../middleware/rateLimit";
import { validateBody, validateQuery } from "../middleware/validate";
import { MAX_UPLOAD_BYTES } from "../services/uploads";
import { AppError } from "../utils/AppError";
import { asyncHandler as h } from "../utils/asyncHandler";
import { createCharacterSchema, updateCharacterSchema } from "../validators/character";
import { browseQuerySchema, portraitGenerateSchema, reportSchema } from "../validators/discovery";

export const characterRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
const singleImage = (req: Request, res: Response, next: NextFunction) =>
  upload.single("image")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return next(AppError.badRequest(err.code === "LIMIT_FILE_SIZE" ? "Images must be 2 MB or smaller" : "Upload failed"));
    }
    next(err);
  });

// Public (signed-in state is optional and only adds favorite flags)
characterRouter.get("/featured", h(async (q, s) => c.featured(q, s)));
characterRouter.get("/browse", optionalAuth, validateQuery(browseQuerySchema), h(async (q, s) => c.browse(q, s)));
characterRouter.get("/traits", h(async (q, s) => c.traits(q, s)));
characterRouter.get("/:id", optionalAuth, h(async (q, s) => c.getOne(q, s)));

// Authenticated
characterRouter.use(requireAuth);
characterRouter.post("/portrait/generate", imageLimiter, validateBody(portraitGenerateSchema), h(async (q, s) => c.generatePortrait(q, s)));
characterRouter.post("/portrait", singleImage, h(async (q, s) => c.uploadPortrait(q, s)));
characterRouter.get("/", h(async (q, s) => c.listMine(q, s)));
characterRouter.post("/", validateBody(createCharacterSchema), h(async (q, s) => c.create(q, s)));
characterRouter.patch("/:id", validateBody(updateCharacterSchema), h(async (q, s) => c.update(q, s)));
characterRouter.delete("/:id", h(async (q, s) => c.remove(q, s)));
characterRouter.post("/:id/duplicate", h(async (q, s) => c.duplicate(q, s)));
characterRouter.post("/:id/report", reportLimiter, validateBody(reportSchema), h(async (q, s) => c.report(q, s)));
