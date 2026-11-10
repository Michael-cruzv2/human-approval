export async function register(): Promise<void> {
  // Builds do not need database credentials; runtime startup must validate them.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { AppConfigurationError, getAppConfig } = await import("@/lib/server/config");
  const { assertRequiredSchema, MissingSchemaError } = await import("@/lib/server/db");
  try {
    getAppConfig();
    await assertRequiredSchema();
  } catch (error) {
    if (error instanceof AppConfigurationError || error instanceof MissingSchemaError) {
      throw error;
    }
    throw new Error(
      "Review App startup check failed. Verify local environment settings and apply db/schema.sql, db/002_review_app.sql, and db/003_approval_requires_email.sql.",
    );
  }
}
