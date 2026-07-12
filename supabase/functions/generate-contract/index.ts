// deno-lint-ignore-file no-explicit-any
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient, sha256Hex } from "../_shared/supabase.ts";
import { generateContractPdf, type ContractData } from "../_shared/pdf.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  try {
    const { user } = await requireUser(req);
    const { reservation_id, force } = (await req.json()) as {
      reservation_id: string;
      force?: boolean;
    };
    if (!reservation_id) return errorResponse("reservation_id required");

    const admin = serviceClient();

    // Access check: seller-owned OR admin
    const { data: reservation, error: rErr } = await admin
      .from("reservations")
      .select(
        `id, code, currency, total_amount, paid_amount, reservation_date,
         check_in, check_out, notes, seller_id,
         customer:customers(full_name, cpf, email, phone, nationality, pax_count),
         hotel:hotels(name, address, city),
         reservation_tours(name, tour_date, pax, unit_price)`,
      )
      .eq("id", reservation_id)
      .maybeSingle();
    if (rErr || !reservation) return errorResponse("reservation_not_found", 404);

    const { data: roleRows } = await admin
      .from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roleRows ?? []).some((r) => r.role === "admin");
    if (!isAdmin && reservation.seller_id !== user.id) {
      return errorResponse("forbidden", 403);
    }

    const data: ContractData = {
      code: reservation.code,
      currency: reservation.currency,
      total_amount: Number(reservation.total_amount),
      paid_amount: Number(reservation.paid_amount),
      reservation_date: reservation.reservation_date,
      check_in: reservation.check_in,
      check_out: reservation.check_out,
      notes: reservation.notes,
      customer: reservation.customer as any,
      hotel: reservation.hotel as any,
      tours: ((reservation.reservation_tours ?? []) as any[]).map((t) => ({
        name: t.name,
        tour_date: t.tour_date,
        pax: t.pax,
        unit_price: Number(t.unit_price),
      })),
    };

    // Deterministic hash: sort tours to ensure stable ordering
    data.tours.sort((a, b) => (a.tour_date + a.name).localeCompare(b.tour_date + b.name));
    const canonical = JSON.stringify(data);
    const dataHash = await sha256Hex(new TextEncoder().encode(canonical));

    // Reuse existing contract if data unchanged
    if (!force) {
      const { data: existing } = await admin
        .from("contracts")
        .select("id, storage_path, version, size_bytes")
        .eq("reservation_id", reservation_id)
        .eq("data_hash", dataHash)
        .maybeSingle();
      if (existing) {
        const { data: signed } = await admin.storage
          .from("contracts")
          .createSignedUrl(existing.storage_path, 3600);
        return jsonResponse({
          reused: true,
          contract_id: existing.id,
          storage_path: existing.storage_path,
          size_bytes: existing.size_bytes,
          signed_url: signed?.signedUrl ?? null,
        });
      }
    }

    // Generate new version
    const pdf = await generateContractPdf(data);

    // Determine next version
    const { data: latest } = await admin
      .from("contracts")
      .select("version")
      .eq("reservation_id", reservation_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const version = (latest?.version ?? 0) + 1;

    const storagePath = `${reservation_id}/v${version}-${dataHash.slice(0, 12)}.pdf`;
    const { error: upErr } = await admin.storage
      .from("contracts")
      .upload(storagePath, pdf, {
        contentType: "application/pdf",
        upsert: true,
        cacheControl: "31536000",
      });
    if (upErr) return errorResponse(`upload_failed: ${upErr.message}`, 500);

    const { data: inserted, error: insErr } = await admin
      .from("contracts")
      .insert({
        reservation_id,
        version,
        storage_path: storagePath,
        data_hash: dataHash,
        size_bytes: pdf.byteLength,
        mime_type: "application/pdf",
        generated_by: user.id,
      })
      .select("id")
      .single();
    if (insErr) return errorResponse(`insert_failed: ${insErr.message}`, 500);

    const { data: signed } = await admin.storage
      .from("contracts")
      .createSignedUrl(storagePath, 3600);

    return jsonResponse({
      reused: false,
      contract_id: inserted.id,
      storage_path: storagePath,
      version,
      size_bytes: pdf.byteLength,
      signed_url: signed?.signedUrl ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = msg === "unauthorized" || msg === "missing_authorization" ? 401 : 500;
    return errorResponse(msg, status);
  }
});
