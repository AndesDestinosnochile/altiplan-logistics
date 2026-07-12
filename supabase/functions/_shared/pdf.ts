// deno-lint-ignore-file no-explicit-any
import {
  PDFDocument,
  StandardFonts,
  rgb,
  PageSizes,
} from "https://esm.sh/pdf-lib@1.17.1";

// Small optimized logo (JPG, ~23KB) fetched once per cold-start and cached.
const LOGO_URL = Deno.env.get("BRAND_LOGO_URL") ?? "";
let cachedLogo: Uint8Array | null = null;

async function loadLogo(): Promise<Uint8Array | null> {
  if (!LOGO_URL) return null;
  if (cachedLogo) return cachedLogo;
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    cachedLogo = new Uint8Array(await res.arrayBuffer());
    return cachedLogo;
  } catch {
    return null;
  }
}

/** Strip metadata + re-serialize with object streams to shrink an existing PDF. */
export async function optimizePdf(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, {
    updateMetadata: false,
    ignoreEncryption: true,
  });
  doc.setTitle("");
  doc.setAuthor("");
  doc.setSubject("");
  doc.setKeywords([]);
  doc.setProducer("");
  doc.setCreator("");
  const out = await doc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
  return out.length < bytes.length ? out : bytes;
}

/** Wrap a raster image (jpg/png) as a compact single-page A4 PDF. */
export async function imageToPdf(
  imageBytes: Uint8Array,
  mime: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setProducer("");
  doc.setCreator("");
  const img = mime.includes("png")
    ? await doc.embedPng(imageBytes)
    : await doc.embedJpg(imageBytes);
  const [pw, ph] = PageSizes.A4;
  const page = doc.addPage([pw, ph]);
  const margin = 24;
  const maxW = pw - margin * 2;
  const maxH = ph - margin * 2;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = img.width * scale;
  const h = img.height * scale;
  page.drawImage(img, {
    x: (pw - w) / 2,
    y: (ph - h) / 2,
    width: w,
    height: h,
  });
  return await doc.save({ useObjectStreams: true });
}

export type ContractData = {
  code: string;
  customer: {
    full_name: string;
    cpf?: string | null;
    email?: string | null;
    phone?: string | null;
    nationality?: string | null;
    pax_count: number;
  };
  hotel?: { name?: string | null; address?: string | null; city?: string | null } | null;
  currency: "BRL" | "CLP";
  total_amount: number;
  paid_amount: number;
  reservation_date: string;
  check_in?: string | null;
  check_out?: string | null;
  tours: Array<{ name: string; tour_date: string; pax: number; unit_price: number }>;
  notes?: string | null;
};

function fmtMoney(v: number, currency: "BRL" | "CLP") {
  const locale = currency === "BRL" ? "pt-BR" : "es-CL";
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(v);
}

/**
 * Text-first contract PDF using Helvetica (standard 14 font — NOT embedded)
 * with a tiny compressed logo header. Optimized for < 150KB.
 */
export async function generateContractPdf(data: ContractData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setProducer("");
  doc.setCreator("");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const [pw, ph] = PageSizes.A4;
  let page = doc.addPage([pw, ph]);
  const marginX = 50;
  let y = ph - 60;

  const navy = rgb(0.11, 0.22, 0.33);
  const ink = rgb(0.12, 0.14, 0.18);

  // Optional logo
  const logoBytes = await loadLogo();
  if (logoBytes) {
    try {
      const logo = await doc.embedJpg(logoBytes);
      const lw = 90;
      const lh = (logo.height / logo.width) * lw;
      page.drawImage(logo, { x: pw - marginX - lw, y: y - lh + 20, width: lw, height: lh });
    } catch { /* fall back to text-only */ }
  }

  const write = (
    text: string,
    opts: { size?: number; bold?: boolean; color?: any; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10.5;
    const f = opts.bold ? bold : font;
    const lines = wrap(text, f, size, pw - marginX * 2);
    for (const line of lines) {
      if (y < 60) {
        page = doc.addPage([pw, ph]);
        y = ph - 60;
      }
      page.drawText(line, { x: marginX, y, size, font: f, color: opts.color ?? ink });
      y -= size + 3;
    }
    y -= opts.gap ?? 4;
  };

  write("CONTRATO DE PRESTAÇÃO DE SERVIÇOS TURÍSTICOS", { size: 14, bold: true, color: navy, gap: 10 });
  write(`Nº ${data.code}    ·    Data: ${data.reservation_date}`, { size: 9, color: navy, gap: 12 });

  write("CONTRATANTE", { size: 11, bold: true, color: navy });
  const c = data.customer;
  const hotelLine = data.hotel?.name
    ? `${data.hotel.name}${data.hotel.address ? " — " + data.hotel.address : ""}${data.hotel.city ? " — " + data.hotel.city : ""}`
    : "—";
  write(
    `${c.full_name}${c.cpf ? ", CPF " + c.cpf : ""}${c.nationality ? " (" + c.nationality + ")" : ""}. ` +
    `Contatos: ${[c.phone, c.email].filter(Boolean).join(" · ") || "—"}. ` +
    `Passageiros: ${c.pax_count}. Hospedado em: ${hotelLine}.`,
    { gap: 8 },
  );

  write("CONTRATADA", { size: 11, bold: true, color: navy });
  write(
    "Andes Destinos no Chile Ltda., CNPJ 58.687.031/0001-42, com sede em São Paulo — SP, " +
    "representada por seu responsável legal.",
    { gap: 8 },
  );

  write("OBJETO", { size: 11, bold: true, color: navy });
  write(
    "Prestação de serviços de turismo, conforme o(s) passeio(s) contratado(s), com saída e retorno " +
    "na cidade de Santiago do Chile, em datas previamente combinadas.",
    { gap: 8 },
  );

  write("PASSEIOS", { size: 11, bold: true, color: navy });
  if (data.tours.length === 0) write("—");
  for (const t of data.tours) {
    write(
      `• ${t.tour_date} — ${t.name} — ${t.pax} pax × ${fmtMoney(t.unit_price, data.currency)} = ` +
      `${fmtMoney(t.unit_price * t.pax, data.currency)}`,
    );
  }
  y -= 4;

  write("VALORES", { size: 11, bold: true, color: navy });
  write(`Valor total: ${fmtMoney(data.total_amount, data.currency)}`);
  write(`Pago: ${fmtMoney(data.paid_amount, data.currency)}`);
  write(`Saldo: ${fmtMoney(data.total_amount - data.paid_amount, data.currency)}`, { gap: 8 });

  write("REGRAS GERAIS", { size: 11, bold: true, color: navy });
  const rules = [
    "1) A CONTRATADA poderá remanejar o passeio para parceiros, se necessário.",
    "2) O CONTRATANTE deve respeitar os horários e regras dos passeios.",
    "3) Cancelamentos até 7 dias antes: multa de 10%. Até 3 dias: 20%. Menos de 24h: multa superior a 20% (se houver custos comprovados).",
    "4) Reembolsos só serão feitos em caso de cancelamento com no mínimo 20 dias de antecedência, ou se a CONTRATADA cancelar por força maior (ex.: nevasca, estrada fechada).",
    "5) Pagamentos via cartão de crédito terão acréscimo de 5% (à vista).",
  ];
  for (const r of rules) write(r);
  y -= 20;

  if (data.notes) {
    write("OBSERVAÇÕES", { size: 11, bold: true, color: navy });
    write(data.notes, { gap: 14 });
  }

  y -= 20;
  write("______________________________________", { gap: 2 });
  write("ANDES DESTINOS NO CHILE LTDA.", { size: 9, bold: true, gap: 14 });
  write("______________________________________", { gap: 2 });
  write("CONTRATANTE", { size: 9, bold: true });

  return await doc.save({ useObjectStreams: true });
}

function wrap(text: string, font: any, size: number, maxWidth: number): string[] {
  const paragraphs = text.split("\n");
  const out: string[] = [];
  for (const p of paragraphs) {
    const words = p.split(/\s+/);
    let line = "";
    for (const w of words) {
      const candidate = line ? line + " " + w : w;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = candidate;
      }
    }
    if (line) out.push(line);
  }
  return out;
}
