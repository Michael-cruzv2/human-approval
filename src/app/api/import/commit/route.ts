import { getApiSessionContext } from "@/lib/server/http/api-auth";
import { getAppConfig } from "@/lib/server/config";
import { isSameOriginRequest, jsonNoStore } from "@/lib/server/auth/http";
import { isValidImportPreviewProof } from "@/lib/server/import/proof";
import { commitImport } from "@/lib/server/import/service";
import { validateImportUpload } from "@/lib/server/import/upload";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginRequest(request))
    return jsonNoStore({ message: "Request origin not allowed." }, 403);
  const session = await getApiSessionContext();
  if (!session) return jsonNoStore({ message: "Sign-in required." }, 401);
  const limits = getAppConfig().app.import;
  const contentLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(contentLength) &&
    contentLength > limits.max_file_mb * 1024 * 1024 + 65_536
  ) {
    return jsonNoStore(
      { message: "The upload exceeds the allowed file size." },
      413,
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonNoStore({ message: "Choose an .xlsx file to continue." }, 400);
  }

  const result = await validateImportUpload(
    formData,
    limits.max_file_mb * 1024 * 1024,
    limits.max_rows,
    limits.max_cell_chars,
  );
  if (!result.ok)
    return jsonNoStore({ message: result.error.message }, result.error.status);

  const upload = result.upload;
  if (!upload.expectedHash || !upload.previewProof)
    return jsonNoStore(
      { message: "Preview the file before committing it." },
      400,
    );
  if (upload.expectedHash !== upload.fileHash) {
    return jsonNoStore(
      {
        message:
          "The file changed after preview. Preview it again before committing.",
      },
      409,
    );
  }
  if (
    !isValidImportPreviewProof(
      upload.previewProof,
      session.token,
      session.user.id,
      upload.fileHash,
    )
  ) {
    return jsonNoStore(
      { message: "The preview is invalid. Preview the file again." },
      409,
    );
  }

  const parsed = upload.parsed;
  const invalidRatio = parsed.invalidRows.length / parsed.totalRows;
  if (invalidRatio > limits.max_invalid_row_ratio) {
    return jsonNoStore(
      {
        message:
          "More than half of the rows are invalid. No rows were imported.",
        invalidRows: parsed.invalidRows,
        validCount: parsed.rows.length,
        invalidCount: parsed.invalidRows.length,
        totalRows: parsed.totalRows,
      },
      422,
    );
  }

  try {
    const outcome = await commitImport(
      session.user.id,
      parsed,
      upload.fileHash,
      limits.max_uploads_per_user_per_hour,
    );
    if (outcome.kind === "NOT_AUTHORIZED")
      return jsonNoStore({ message: "Sign-in required." }, 401);
    if (outcome.kind === "RATE_LIMITED") {
      return jsonNoStore(
        { message: "Import limit reached. Try again in an hour." },
        429,
      );
    }
    return jsonNoStore({
      inserted: outcome.inserted,
      skipped: outcome.skipped,
      invalid: parsed.invalidRows.length,
      totalRows: parsed.totalRows,
      invalidRows: parsed.invalidRows,
    });
  } catch {
    return jsonNoStore(
      { message: "Import could not be completed. No rows were committed." },
      503,
    );
  }
}
