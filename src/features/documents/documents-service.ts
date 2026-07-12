import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("not_authenticated");
  return {
    Authorization: `Bearer ${token}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

export type ContractResponse = {
  reused: boolean;
  contract_id: string;
  storage_path: string;
  size_bytes: number;
  version?: number;
  signed_url: string | null;
};

/**
 * Regenerates the contract only when the reservation data hash changed.
 * Set `force` to true to force a new version even if nothing changed.
 */
export async function generateContract(
  reservationId: string,
  opts: { force?: boolean } = {},
): Promise<ContractResponse> {
  const res = await fetch(`${FUNCTIONS_BASE}/generate-contract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ reservation_id: reservationId, force: opts.force }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "contract_failed");
  return (await res.json()) as ContractResponse;
}

export type DocumentResponse = {
  reused: boolean;
  document_id: string;
  storage_path: string;
  size_bytes: number;
  mime_type?: string;
  signed_url: string | null;
  deduplicated?: string;
};

/**
 * Uploads an invoice/receipt/other document. The edge function normalizes it
 * (image → optimized PDF, PDF → metadata-stripped/recompressed) and dedupes by
 * SHA-256 hash before storing.
 *
 * HEIC files must be converted to JPG on the client (via heic2any) before
 * calling this — Deno cannot decode HEIC. See `convertHeicToJpeg` below.
 */
export async function uploadDocument(params: {
  reservationId: string;
  kind: "invoice" | "receipt" | "other";
  file: File;
}): Promise<DocumentResponse> {
  let file = params.file;
  // Client-side HEIC → JPEG conversion (Deno-friendly bytes for the edge fn).
  if (/\.hei[cf]$/i.test(file.name) || /image\/hei[cf]/i.test(file.type)) {
    file = await convertHeicToJpeg(file);
  }
  const form = new FormData();
  form.set("reservation_id", params.reservationId);
  form.set("kind", params.kind);
  form.set("file", file);
  const res = await fetch(`${FUNCTIONS_BASE}/store-document`, {
    method: "POST",
    headers: await authHeaders(),
    body: form,
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "upload_failed");
  return (await res.json()) as DocumentResponse;
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;
  const blob = (await heic2any({ blob: file, toType: "image/jpeg", quality: 0.7 })) as Blob;
  const name = file.name.replace(/\.hei[cf]$/i, ".jpg");
  return new File([blob], name, { type: "image/jpeg" });
}

/** Get a fresh signed URL for viewing/downloading a stored document. */
export async function getSignedUrl(
  bucket: "contracts" | "invoices" | "receipts" | "misc",
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
