// deno-lint-ignore-file no-explicit-any
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { requireUser, serviceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("method_not_allowed", 405);

  try {
    const { user } = await requireUser(req);
    const { reservation_id, to, subject, html, attach_contract } = await req.json();
    if (!reservation_id || !to || !subject || !html) return errorResponse("missing_fields");

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SENDER_EMAIL = Deno.env.get("SENDER_EMAIL");
    const SENDER_NAME = Deno.env.get("SENDER_NAME") ?? "Andes Destinos";
    if (!RESEND_API_KEY || !SENDER_EMAIL) return errorResponse("email_not_configured", 500);

    const admin = serviceClient();

    // Access check
    const { data: reservation } = await admin
      .from("reservations").select("id, seller_id").eq("id", reservation_id).maybeSingle();
    if (!reservation) return errorResponse("reservation_not_found", 404);
    const { data: roleRows } = await admin
      .from("user_roles").select("role").eq("user_id", user.id);
    const isAdmin = (roleRows ?? []).some((r) => r.role === "admin");
    if (!isAdmin && reservation.seller_id !== user.id) return errorResponse("forbidden", 403);

    const attachments: Array<{ filename: string; content: string }> = [];
    if (attach_contract) {
      const { data: contract } = await admin
        .from("contracts")
        .select("storage_path")
        .eq("reservation_id", reservation_id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (contract) {
        const { data: file } = await admin.storage
          .from("contracts")
          .download(contract.storage_path);
        if (file) {
          const buf = new Uint8Array(await file.arrayBuffer());
          const b64 = btoa(String.fromCharCode(...buf));
          attachments.push({ filename: "contrato.pdf", content: b64 });
        }
      }
    }

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${SENDER_NAME} <${SENDER_EMAIL}>`,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        attachments: attachments.length ? attachments : undefined,
      }),
    });
    const body = await resp.json();

    await admin.from("email_logs").insert({
      reservation_id,
      to_email: Array.isArray(to) ? to.join(",") : to,
      subject,
      body_preview: html.slice(0, 500),
      status: resp.ok ? "sent" : "failed",
      provider_message_id: body?.id ?? null,
      error: resp.ok ? null : JSON.stringify(body),
      sent_by: user.id,
    });

    if (!resp.ok) return errorResponse(body?.message ?? "resend_error", 502);
    return jsonResponse({ ok: true, id: body.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    const status = msg === "unauthorized" || msg === "missing_authorization" ? 401 : 500;
    return errorResponse(msg, status);
  }
});
