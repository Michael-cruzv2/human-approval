import { getApiSessionContext } from "@/lib/server/http/api-auth";
import { getAppConfig } from "@/lib/server/config";
import { isSameOriginRequest, jsonNoStore } from "@/lib/server/auth/http";
import { createImportPreviewProof } from "@/lib/server/import/proof";
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

  const parsed = result.upload.parsed;
  const invalidRatio = parsed.invalidRows.length / parsed.totalRows;
  return jsonNoStore({
    preview: {
      fileHash: result.upload.fileHash,
      proof: createImportPreviewProof(
        session.token,
        session.user.id,
        result.upload.fileHash,
      ),
      totalRows: parsed.totalRows,
      validCount: parsed.rows.length,
      invalidCount: parsed.invalidRows.length,
      invalidRatio,
      canCommit:
        parsed.rows.length > 0 && invalidRatio <= limits.max_invalid_row_ratio,
      validRows: parsed.rows.map(({ rowNumber, lead }) => ({
        rowNumber,
        domain: lead.domain,
        companyName: lead.company_name,
        email: lead.email,
      })),
      invalidRows: parsed.invalidRows,
    },
  });
}
