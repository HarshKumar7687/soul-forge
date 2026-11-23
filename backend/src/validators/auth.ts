import { z } from "zod";

const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use at most 128 characters")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Include at least one letter and one number");

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  password,
  displayName: z.string().trim().min(2, "Use at least 2 characters").max(40),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password").max(128),
});

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(2, "Use at least 2 characters").max(40).optional(),
    bio: z.string().trim().max(280).optional(),
    replyLength: z.enum(["short", "medium", "long"]).optional(),
  })
  .strict();

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm").max(128),
});
