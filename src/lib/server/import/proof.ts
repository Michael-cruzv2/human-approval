import "server-only";

import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";

export function createImportPreviewProof(
  sessionToken: string,
  userId: string,
  fileHash: string,
): string {
  return createHmac("sha256", sessionToken)
    .update(`lead-import-preview\n${userId}\n${fileHash}`)
    .digest("hex");
}

export function isValidImportPreviewProof(
  proof: string,
  sessionToken: string,
  userId: string,
  fileHash: string,
): boolean {
  if (!/^[a-f\d]{64}$/i.test(proof)) return false;
  const expected = Buffer.from(
    createImportPreviewProof(sessionToken, userId, fileHash),
    "hex",
  );
  const submitted = Buffer.from(proof, "hex");
  return (
    submitted.length === expected.length && timingSafeEqual(submitted, expected)
  );
}
