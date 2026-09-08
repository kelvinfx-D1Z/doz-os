// ============================================================
// THE FOUNDER'S SIGNATURE, AS A DATA URL
//
// A signature is uploaded in the browser, read straight to a base64 data
// URL, and stored on the CompanySettings row. There is no file on disk
// anywhere in this path — deliberately. The expenses route writes uploads
// to a local directory, which works on a machine you own and silently
// loses the file on Vercel, where the filesystem is rebuilt on every
// deploy. A signature that vanishes without telling anyone would leave
// invoices printing an empty signature box, and nobody would notice until
// a client did.
//
// So the whole contract is one string, and this module owns what may be in
// it. Pure and DB-free, like document-math.ts, so the API route, the
// dialog and the tests all share one answer rather than each guessing.
//
// WHY THE FORMAT ALLOWLIST IS SHORT
// PNG, JPEG and WebP only. Not SVG: an SVG is a document, not a bitmap —
// it can carry script and external references, and it would be stored
// verbatim and served back into every rendered quotation and invoice. A
// signature has no need of it, so the format simply is not accepted.
// ============================================================

/** Image types a signature may be. See the note above on SVG. */
export const SIGNATURE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/**
 * The largest signature accepted, in characters of data URL.
 *
 * ~250KB of base64, so a little under 190KB of image — far more than a
 * signature needs (a trimmed transparent PNG is usually 10-40KB) and far
 * less than would make a row awkward to read or back up.
 */
export const MAX_SIGNATURE_CHARS = 250_000;

/** Roughly the decoded size of a base64 payload, for a human-readable error. */
export function approxBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma === -1 ? "" : dataUrl.slice(comma + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export interface SignatureRejection {
  error: string;
}

/**
 * Validate a signature data URL.
 *
 * Returns `{ value }` with the accepted string, `{ value: null }` when the
 * founder is deliberately clearing the signature, or `{ error }` with a
 * message meant to be shown to him as-is.
 *
 * An empty string clears. That is not the same as the field being absent
 * from a request body — absent means "this form did not touch the
 * signature", and the caller decides that. This function only ever sees a
 * value the founder actually submitted.
 */
export function validateSignature(input: unknown): { value: string | null } | SignatureRejection {
  if (input === null) return { value: null };
  if (typeof input !== "string") {
    return { error: "A signature must be an image." };
  }
  const value = input.trim();
  if (value === "") return { value: null };

  if (!value.startsWith("data:")) {
    return {
      error: "A signature must be an uploaded image, not a link. Choose a file instead.",
    };
  }

  const match = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match) {
    return { error: "That file could not be read as an image. Try a PNG." };
  }

  const [, mime, b64] = match;
  if (!(SIGNATURE_TYPES as readonly string[]).includes(mime.toLowerCase())) {
    return {
      error: `A signature must be a PNG, JPEG or WebP image — ${mime} is not accepted.`,
    };
  }

  // Base64 without padding to a multiple of four is truncated, and would be
  // stored as an image that renders as a broken box on every document.
  if (b64.length % 4 !== 0) {
    return { error: "That image looks incomplete. Try uploading it again." };
  }

  if (value.length > MAX_SIGNATURE_CHARS) {
    const kb = Math.round(approxBytes(value) / 1024);
    return {
      error: `That image is ${kb}KB, which is larger than a signature needs. Crop it, or save it as a PNG under 180KB.`,
    };
  }

  return { value };
}
