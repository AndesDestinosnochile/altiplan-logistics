// deno-lint-ignore-file no-explicit-any
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient, sha256Hex } from "../_shared/supabase.ts";
import { imageToPdf, optimizePdf } from "../_shared/pdf.ts";

const BUCKETS: Record<string, string> = {
  invoice: "invoices",
  receipt: "receipts",
  other: "misc",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  try {
    const { user } = await requireUser(req);
    const form = await req.formData();
    const reservation_id = String(form.get("reservation_id") ?? "");
    const kind = String(form.get("kind") ?? "invoice") as "invoice" | "receipt" | "other";
    const file = form.get("file") as File | null;
    if (!reservation_id || !file) return errorResponse("reservation_id and file required");
    if (!BUCKETS[kind]) return errorResponse("invalid_kind");

    const admin = serviceClient();

    // Access check
    const { data: reservation } = await admin
      .from("reservations").select("id, seller_id").eq("id", reservation_id).maybeSingle();
    if (!reservation) return errorResponse("reservation_not_found", 404);
    const { data: roleRows } = await admin
      .from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roleRows ?? []).some((r) => r.role === "admin");
    if (!isAdmin && reservation.seller_id !== user.id) {
      return errorResponse("forbidden", 403);
    }

    const raw = new Uint8Array(await file.arrayBuffer());
    const mime = (file.type || "application/octet-stream").toLowerCase();
    const name = file.name || "upload";

    // Normalize → always store as optimized PDF (except unknown "other" types).
    let bytes: Uint8Array;
    let outMime = "application/pdf";
    let ext = "pdf";

    if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
      bytes = await optimizePdf(raw);
    } else if (mime.startsWith("image/jpeg") || mime.startsWith("image/jpg")) {
      bytes = await imageToPdf(raw, "image/jpeg");
    } else if (mime.startsWith("image/png")) {
      bytes = await imageToPdf(raw, "image/png");
    } else if (kind === "other") {
      // Preserve original for "other" kind
      bytes = raw;
      outMime = mime;
      ext = name.includes(".") ? name.split(".").pop()! : "bin";
    } else {
      return errorResponse(
        `unsupported_type: ${mime}. Envie PDF, JPG ou PNG (HEIC deve ser convertido antes do upload).`,
      );
    }

    const contentHash = await sha256Hex(bytes);

    // Dedup: reuse existing storage_path if same hash already stored
    const { data: existingSame } = await admin
      .from("documents")
      .select("id, storage_path, size_bytes, mime_type")
      .eq("reservation_id", reservation_id)
      .eq("kind", kind)
      .eq("content_hash", contentHash)
      .maybeSingle();
    if (existingSame) {
      const { data: signed } = await admin.storage
        .from(BUCKETS[kind])
        .createSignedUrl(existingSame.storage_path, 3600);
      return jsonResponse({
        reused: true,
        deduplicated: "same_reservation",
        document_id: existingSame.id,
        storage_path: existingSame.storage_path,
        size_bytes: existingSame.size_bytes,
        signed_url: signed?.signedUrl ?? null,
      });
    }

    // Global dedup: if the exact bytes already exist in ANY reservation,
    // point the new document row at the same storage object (no re-upload).
    const { data: globalHit } = await admin
      .rpc("find_document_by_hash", { _hash: contentHash });
    let storagePath: string;
    let sizeBytes = bytes.byteLength;
    if (globalHit && globalHit.length > 0) {
      storagePath = globalHit[0].storage_path;
      sizeBytes = Number(globalHit[0].size_bytes ?? bytes.byteLength);
    } else {
      storagePath = `${reservation_id}/${contentHash.slice(0, 12)}.${ext}`;
      const { error: upErr } = await admin.storage
        .from(BUCKETS[kind])
        .upload(storagePath, bytes, {
          contentType: outMime,
          upsert: false,
          cacheControl: "31536000",
        });
      if (upErr && !upErr.message.includes("exists")) {
        return errorResponse(`upload_failed: ${upErr.message}`, 500);
      }
    }

    const { data: inserted, error: insErr } = await admin
      .from("documents")
      .insert({
        reservation_id,
        kind,
        file_name: name,
        storage_path: storagePath,
        mime_type: outMime,
        size_bytes: sizeBytes,
        content_hash: contentHash,
        uploaded_by: user.id,
      })
      .select("id")
      .single();
    if (insErr) return errorResponse(`insert_failed: ${insErr.message}`, 500);

    const { data: signed } = await admin.storage
      .from(BUCKETS[kind])
      .createSignedUrl(storagePath, 3600);

    return jsonResponse({
      reused: false,
      document_id: inserted.id,
      storage_path: storagePath,
      size_bytes: sizeBytes,
      mime_type: outMime,
      signed_url: signed?.signedUrl ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = msg === "unauthorized" || msg === "missing_authorization" ? 401 : 500;
    return errorResponse(msg, status);
  }
});
