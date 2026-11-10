import "server-only";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { z } from "zod";

const EnvironmentSchema = z
  .object({
    DATABASE_URL: z.url().refine((value) => /^postgres(?:ql)?:/.test(value), {
      message: "must be a PostgreSQL connection URL",
    }).optional(),
    DATABASE_CHILD_URL: z.url().refine((value) => /^postgres(?:ql)?:/.test(value), {
      message: "must be a PostgreSQL connection URL",
    }).optional(),
    DATABASE_TARGET: z.enum(["child", "main"]).optional(),
    SESSION_SECRET: z.string().min(32),
    OTP_PEPPER: z.string().min(32),
    MAILGUN_API_KEY: z.string().min(1),
    MAILGUN_DOMAIN: z.string().min(1),
    MAILGUN_REGION: z.enum(["US", "EU"]),
    EMAIL_FROM: z.email(),
    APP_ORIGIN: z.url().refine((value) => {
      const parsed = new URL(value);
      return parsed.origin === value;
    }, "must be an origin without a path"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  })
  .superRefine((value, context) => {
    const databaseTarget = value.DATABASE_TARGET ?? (value.NODE_ENV === "production" ? "main" : "child");
    if (databaseTarget === "child" && !value.DATABASE_CHILD_URL) {
      context.addIssue({ code: "custom", path: ["DATABASE_CHILD_URL"], message: "required for child database testing" });
    }
    if (databaseTarget === "main" && !value.DATABASE_URL) {
      context.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "required for main database mode" });
    }
    if (value.NODE_ENV !== "production" && databaseTarget === "main") {
      context.addIssue({ code: "custom", path: ["DATABASE_TARGET"], message: "local development must use child" });
    }
    if (value.SESSION_SECRET === value.OTP_PEPPER) {
      context.addIssue({
        code: "custom",
        path: ["OTP_PEPPER"],
        message: "must be different from SESSION_SECRET",
      });
    }
    const appUrl = new URL(value.APP_ORIGIN);
    const isLocalOrigin = ["localhost", "127.0.0.1", "[::1]"].includes(appUrl.hostname);
    if (
      value.NODE_ENV === "production" &&
      appUrl.protocol !== "https:" &&
      !isLocalOrigin
    ) {
      context.addIssue({
        code: "custom",
        path: ["APP_ORIGIN"],
        message: "must use HTTPS in production",
      });
    }
  });

const AppYamlSchema = z
  .object({
    app: z.object({ name: z.string().min(1), max_active_users: z.literal(3) }).strict(),
    auth: z
      .object({
        otp_length: z.literal(6),
        otp_ttl_minutes: z.number().int().positive(),
        otp_max_attempts: z.number().int().positive(),
        otp_resend_cooldown_seconds: z.number().int().positive(),
        otp_max_requests_per_email_per_hour: z.number().int().positive(),
        otp_max_requests_per_ip_per_hour: z.number().int().positive(),
        failed_verify_lockout_threshold: z.number().int().positive(),
        failed_verify_lockout_minutes: z.number().int().positive(),
        session_idle_hours: z.number().positive(),
        session_absolute_days: z.number().positive(),
        cookie_name: z.literal("__Host-session"),
      })
      .strict(),
    review: z
      .object({
        lead_queue_page_size: z.literal(25),
        draft_queue_page_size: z.literal(25),
        require_note_on_reject: z.boolean(),
        allow_bulk_reject_leads: z.boolean(),
        allow_bulk_approve: z.literal(false),
      })
      .strict(),
    import: z
      .object({
        max_file_mb: z.number().positive(),
        max_rows: z.number().int().positive(),
        max_cell_chars: z.number().int().positive(),
        max_invalid_row_ratio: z.number().min(0).max(1),
        max_uploads_per_user_per_hour: z.number().int().positive(),
      })
      .strict(),
    display: z
      .object({
        batch_size: z.number().int().positive(),
        daily_ceiling: z.number().int().positive(),
        max_attempts: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

export type AppConfig = {
  env: z.infer<typeof EnvironmentSchema>;
  app: z.infer<typeof AppYamlSchema>;
};

let loadedConfig: AppConfig | undefined;

export class AppConfigurationError extends Error {}

export function getAppConfig(): AppConfig {
  if (loadedConfig) return loadedConfig;

  const envResult = EnvironmentSchema.safeParse(process.env);
  if (!envResult.success) {
    const missing = envResult.error.issues
      .map((issue) => issue.path.join("."))
      .filter((field, index, fields) => fields.indexOf(field) === index);
    throw new AppConfigurationError(
      `Invalid application environment configuration: ${missing.join(", ")}`,
    );
  }

  let rawYaml: unknown;
  try {
    rawYaml = parse(readFileSync(resolve(process.cwd(), "config/app.yaml"), "utf8"));
  } catch {
    throw new AppConfigurationError("Unable to read config/app.yaml");
  }

  const appResult = AppYamlSchema.safeParse(rawYaml);
  if (!appResult.success) {
    throw new AppConfigurationError(
      "config/app.yaml does not match the application configuration schema",
    );
  }

  loadedConfig = { env: envResult.data, app: appResult.data };
  return loadedConfig;
}
