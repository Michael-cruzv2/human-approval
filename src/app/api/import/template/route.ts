import { getApiSessionUser } from "@/lib/server/http/api-auth";
import { jsonNoStore } from "@/lib/server/auth/http";
import { createImportTemplate } from "@/lib/server/import/xlsx";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const actor = await getApiSessionUser();
  if (!actor) return jsonNoStore({ message: "Sign-in required." }, 401);

  try {
    const workbook = await createImportTemplate();
    return new Response(new Uint8Array(workbook), {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="lead-import-template.xlsx"',
      },
    });
  } catch {
    return jsonNoStore(
      { message: "The template could not be generated." },
      503,
    );
  }
}
