import "server-only";

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  parseXlsxWorkbook,
  ImportFileError,
  type ParsedWorkbook,
} from "./xlsx";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type UploadError = { status: number; message: string };
export type ValidatedUpload = {
  fileHash: string;
  expectedHash: string | null;
  previewProof: string | null;
  parsed: ParsedWorkbook;
};
export type ImportUploadResult =
  { ok: true; upload: ValidatedUpload } | { ok: false; error: UploadError };

export async function validateImportUpload(
  formData: FormData,
  maxFileBytes: number,
  maxRows: number,
  maxCellChars: number,
): Promise<ImportUploadResult> {
  const file = formData.get("file");
  if (typeof file === "string" || file === null) {
    return {
      ok: false,
      error: { status: 400, message: "Choose an .xlsx file to continue." },
    };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx") || file.type !== XLSX_MIME) {
    return {
      ok: false,
      error: { status: 400, message: "Only .xlsx files are supported." },
    };
  }
  if (file.size > maxFileBytes) {
    return {
      ok: false,
      error: {
        status: 413,
        message: `The file must be no larger than ${Math.floor(maxFileBytes / 1024 / 1024)} MB.`,
      },
    };
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return {
      ok: false,
      error: { status: 400, message: "The uploaded file could not be read." },
    };
  }
  if (buffer.length > maxFileBytes) {
    return {
      ok: false,
      error: {
        status: 413,
        message: `The file must be no larger than ${Math.floor(maxFileBytes / 1024 / 1024)} MB.`,
      },
    };
  }
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    return {
      ok: false,
      error: {
        status: 400,
        message: "The file signature is not a valid .xlsx workbook.",
      },
    };
  }

  const expectedHashValue = formData.get("sha256");
  const expectedHash =
    typeof expectedHashValue === "string" ? expectedHashValue : null;
  if (expectedHash !== null && !/^[a-f\d]{64}$/i.test(expectedHash)) {
    return {
      ok: false,
      error: {
        status: 400,
        message: "The preview is invalid. Preview the file again.",
      },
    };
  }
  const previewProofValue = formData.get("previewProof");
  const previewProof =
    typeof previewProofValue === "string" ? previewProofValue : null;
  if (previewProof !== null && !/^[a-f\d]{64}$/i.test(previewProof)) {
    return {
      ok: false,
      error: {
        status: 400,
        message: "The preview is invalid. Preview the file again.",
      },
    };
  }

  try {
    const parsed = await parseXlsxWorkbook(buffer, maxRows, maxCellChars);
    return {
      ok: true,
      upload: {
        fileHash: createHash("sha256").update(buffer).digest("hex"),
        expectedHash,
        previewProof,
        parsed,
      },
    };
  } catch (error) {
    if (error instanceof ImportFileError) {
      return { ok: false, error: { status: 400, message: error.message } };
    }
    return {
      ok: false,
      error: {
        status: 400,
        message: "The file could not be read as an .xlsx workbook.",
      },
    };
  }
}
