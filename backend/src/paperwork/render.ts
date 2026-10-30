// Paperwork as a self-contained, printable HTML page (A4; the browser's "Save as PDF" makes the PDF)
// and the register as CSV. No external assets, so a page can be emailed, stored or embedded as is.
import { config } from "../config";
import { formatFssai } from "./fssai";
import type { Confirmation, DonationDeclaration, HandoverNote, Paperwork, Party, Register } from "./types";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: config.TZ_NAME, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

const METHOD: Record<Confirmation["method"], string> = {
  voice_call: "Said aloud on the voice call",
  web_form: "Ticked on the web form",
  telegram: "Confirmed on Telegram",
  unknown: "Recorded in AnnaRelay",
};

const CSS = `
:root{--ink:#14181f;--mute:#5b6472;--line:#d9dde3;--soft:#f4f6f8;--ok:#0f7b52;--warn:#9a5b00;--brand:#0068c9}
*{box-sizing:border-box}
body{margin:0;background:#e9ecef;color:var(--ink);font:13px/1.5 "Segoe UI",system-ui,-apple-system,sans-serif}
.page{position:relative;max-width:210mm;margin:24px auto;background:#fff;padding:18mm 16mm;box-shadow:0 8px 30px rgb(0 0 0/.12);overflow:hidden}
.sample{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.sample span{transform:rotate(-28deg);font-size:64px;font-weight:800;letter-spacing:.08em;color:rgb(200 30 30/.09);white-space:nowrap}
header{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid var(--ink);padding-bottom:12px}
.brand{font-weight:800;font-size:15px;letter-spacing:.02em}.brand small{display:block;font-weight:400;color:var(--mute);font-size:11px}
h1{margin:10px 0 0;font-size:20px;letter-spacing:-.01em}
.meta{text-align:right;font-size:12px;color:var(--mute)}.meta b{color:var(--ink);font-size:13px}
.badge{display:inline-block;margin-top:6px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.b-ok{background:#e3f4ec;color:var(--ok)}.b-warn{background:#fdf0dc;color:var(--warn)}
h2{margin:22px 0 8px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mute)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.card{border:1px solid var(--line);border-radius:8px;padding:10px 12px}
.card .k{font-size:11px;color:var(--mute)}.card .v{font-weight:600}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);background:var(--soft);font-weight:600}
td.n{text-align:right;font-variant-numeric:tabular-nums}
.tick{color:var(--ok);font-weight:700}.cross{color:#b42318;font-weight:700}
.note{background:var(--soft);border-radius:8px;padding:10px 12px;color:var(--mute);font-size:12px}
.quote{white-space:pre-wrap;border-left:3px solid var(--line);padding-left:10px;color:var(--mute);font-size:12px}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}
.sign div{border-top:1px solid var(--ink);padding-top:6px;font-size:11px;color:var(--mute)}
footer{margin-top:26px;padding-top:10px;border-top:1px solid var(--line);display:flex;justify-content:space-between;gap:12px;font-size:10.5px;color:var(--mute)}
code{font-family:ui-monospace,Consolas,monospace;font-size:11px}
@media print{body{background:#fff}.page{margin:0;box-shadow:none;max-width:none}}
@page{size:A4;margin:0}
`;

/** `landscape` for wide tables (the register): A4 sideways on screen and on paper. */
function shell(title: string, sample: boolean, body: string, landscape = false): string {
  const wide = landscape ? ".page{max-width:297mm}table code{white-space:nowrap}@page{size:A4 landscape;margin:0}" : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}${wide}</style></head><body><main class="page">
${sample ? '<div class="sample" aria-hidden="true"><span>SAMPLE · NOT A LEGAL DOCUMENT</span></div>' : ""}
${body}
</main></body></html>`;
}

function head(title: string, docNo: string, badge: { text: string; ok: boolean }): string {
  return `<header><div><div class="brand">AnnaRelay<small>Surplus food donation record</small></div><h1>${esc(title)}</h1></div>
<div class="meta">Document no.<br><b>${esc(docNo)}</b><br><span class="badge ${badge.ok ? "b-ok" : "b-warn"}">${esc(badge.text)}</span></div></header>`;
}

function fssaiLine(p: Party): string {
  const f = p.fssai;
  if (!f.number) return `<span class="cross">Not on file</span>`;
  const shown = f.check.valid ? formatFssai(f.number) : f.number;
  const kind = f.check.valid ? ` (${f.check.kind})` : "";
  const status = f.verified ? `<span class="tick">verified</span>` : f.check.valid ? "format OK, not verified with FSSAI" : `<span class="cross">${esc(f.check.reason)}</span>`;
  return `<code>${esc(shown)}</code>${esc(kind)} · ${status}`;
}

function partyCard(label: string, p: Party): string {
  return `<div class="card"><div class="k">${esc(label)}</div><div class="v">${esc(p.name)}</div>
<div>${esc(p.address ?? p.area)}</div>${p.contact_person ? `<div>Contact: ${esc(p.contact_person)}</div>` : ""}
<div style="margin-top:6px"><span class="k">FSSAI no.</span> ${fssaiLine(p)}</div></div>`;
}

function foodTable(items: { name: string; quantity: number; unit: string }[], meals: number, diet: "veg" | "nonveg"): string {
  const rows = items.length
    ? items.map((i) => `<tr><td>${esc(i.name)}</td><td class="n">${esc(i.quantity || "—")}</td><td>${esc(i.unit)}</td></tr>`).join("")
    : `<tr><td>Cooked food</td><td class="n">—</td><td>—</td></tr>`;
  return `<table><thead><tr><th>Item</th><th class="n">Qty</th><th>Unit</th></tr></thead><tbody>${rows}
<tr><td><b>Total meals</b> · ${diet === "veg" ? "Vegetarian" : "Non-vegetarian"}</td><td class="n"><b>${meals}</b></td><td>plates</td></tr></tbody></table>`;
}

function confirmTable(cs: Confirmation[]): string {
  return `<table><thead><tr><th>Statement</th><th>How</th><th>When</th></tr></thead><tbody>${cs
    .map((c) => `<tr><td><span class="${c.confirmed ? "tick" : "cross"}">${c.confirmed ? "✓" : "✗"}</span> ${esc(c.statement)}</td>
<td>${esc(METHOD[c.method])}${c.evidence ? `<br><code>${esc(c.evidence)}</code>` : ""}</td><td>${esc(fmtDateTime(c.at))}</td></tr>`)
    .join("")}</tbody></table>`;
}

function foot(doc: { fingerprint: string; generated_at: string }, extra = ""): string {
  return `<footer><div>Generated by AnnaRelay on ${esc(fmtDateTime(doc.generated_at))}.${extra}<br>
FSSAI numbers are format-checked only unless marked verified.</div><div style="text-align:right">Record fingerprint<br><code>${esc(doc.fingerprint)}</code></div></footer>`;
}

export function renderDeclaration(d: DonationDeclaration): string {
  const badge = d.status === "awaiting_pickup" ? { text: "Awaiting pickup", ok: false }
    : d.status === "not_collected" ? { text: "Not collected", ok: false } : { text: d.status === "collected" ? "Collected" : "Partly collected", ok: true };
  const ai = d.ai_check
    ? `<h2>Automatic checks</h2><div class="note">${d.ai_check.diet_label ? `Diet check: ${esc(d.ai_check.diet_label)} (${Math.round((d.ai_check.diet_probability ?? 0) * 100)}%). ` : ""}${
      d.ai_check.safety_concern_probability != null ? `Food-safety concern: ${Math.round(d.ai_check.safety_concern_probability * 100)}%. ` : ""}${
      d.ai_check.notes.map(esc).join(" ")}${d.ai_check.needs_confirmation ? " The donor was asked to confirm because of this." : ""}</div>`
    : "";
  const transcript = d.donor_words
    ? `<h2>What the donor said</h2><p class="quote">${esc(d.donor_words)}</p>`
    : "";
  const body = `${head("Donation declaration", d.doc_no, badge)}
<h2>Donor</h2><div class="grid">${partyCard("Food business (donor)", d.donor)}
<div class="card"><div class="k">Listed</div><div class="v">${esc(fmtDateTime(d.confirmations[0]?.at))}</div>
<div>${esc(METHOD[d.confirmations[0]?.method ?? "unknown"])}</div>${d.call ? `<div>Language: ${esc(d.call.language ?? "auto")}</div>` : ""}</div></div>
<h2>Food</h2>${foodTable(d.food.items, d.food.meal_count, d.food.diet)}
<div class="grid" style="margin-top:12px">
<div class="card"><div class="k">Cooked at</div><div class="v">${esc(fmtDateTime(d.food.cooked_at))}</div></div>
<div class="card"><div class="k">Safe to eat until</div><div class="v">${esc(fmtDateTime(d.food.safe_until))}</div><div>${d.food.hold_hours} h after cooking</div></div></div>
${d.food.pickup_notes ? `<p class="note" style="margin-top:12px">Pickup: ${esc(d.food.pickup_notes)}</p>` : ""}
<h2>Donor's confirmations</h2>${confirmTable(d.confirmations)}
${ai}${transcript}
<p class="note" style="margin-top:16px">The donor declares that the food above was prepared and stored as confirmed, and is offered free of charge
for people in need. AnnaRelay records what the donor stated; it does not inspect the food.</p>
${foot(d)}`;
  return shell(`Donation declaration ${d.doc_no}`, d.sample, body);
}

export function renderHandover(h: HandoverNote): string {
  const badge = h.within_safe_window ? { text: "Within safe window", ok: true } : { text: "After safe window", ok: false };
  const spare = h.minutes_to_spare >= 0
    ? `${Math.floor(h.minutes_to_spare / 60)} h ${h.minutes_to_spare % 60} min before the safe window closed`
    : `${Math.abs(h.minutes_to_spare)} min after the safe window closed`;
  const body = `${head("Food handover note", h.doc_no, badge)}
<p class="note" style="margin-top:14px">Linked to donation declaration <b>${esc(h.declaration_no)}</b>.</p>
<h2>Parties</h2><div class="grid">${partyCard("Donor (food business)", h.donor)}${partyCard("Received by (food recovery organisation)", h.recipient)}</div>
<h2>Food handed over</h2>${foodTable(h.food.items, h.food.meals, h.food.diet)}
<div class="grid" style="margin-top:12px">
<div class="card"><div class="k">Cooked at</div><div class="v">${esc(fmtDateTime(h.food.cooked_at))}</div><div>Safe until ${esc(fmtDateTime(h.food.safe_until))}</div></div>
<div class="card"><div class="k">Picked up</div><div class="v">${esc(fmtDateTime(h.picked_up_at))}</div><div>${esc(spare)}</div></div></div>
<h2>Confirmations</h2>${confirmTable(h.confirmations)}
<div class="sign"><div>For the donor</div><div>For the receiving organisation</div></div>
${foot(h)}`;
  return shell(`Handover note ${h.doc_no}`, h.sample, body);
}

export function renderRegister(r: Register): string {
  const [y, m] = r.period.split("-");
  const month = new Date(Date.UTC(Number(y), Number(m) - 1, 15)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const rows = r.rows.length
    ? r.rows.map((x) => `<tr><td>${esc(x.date)}</td><td><code>${esc(x.doc_no)}</code></td><td>${esc(x.donor)}${x.donor_fssai ? `<br><code>${esc(x.donor_fssai)}</code>` : ""}</td>
<td>${esc(x.food)}<br><span style="color:var(--mute)">${x.diet === "veg" ? "Veg" : "Non-veg"}</span></td><td class="n">${x.meals_offered}</td><td class="n">${x.meals_collected}</td>
<td>${esc(x.collected_by || "—")}</td><td>${esc(fmtDateTime(x.picked_up_at))}</td><td>${esc(x.outcome)}</td><td>${x.safety_confirmed ? '<span class="tick">✓</span>' : '<span class="cross">✗</span>'}</td></tr>`).join("")
    : `<tr><td colspan="10" style="text-align:center;color:var(--mute)">No donations this month</td></tr>`;
  const t = r.totals;
  const body = `${head(`Donation register · ${month}`, `REG-${r.period}${r.donor_id ? `-${r.donor_id}` : ""}`, { text: `${t.donations} donations`, ok: true })}
<div class="grid" style="margin-top:14px;grid-template-columns:repeat(4,1fr)">
<div class="card"><div class="k">Donations</div><div class="v">${t.donations}</div></div>
<div class="card"><div class="k">Meals offered</div><div class="v">${t.meals_offered}</div></div>
<div class="card"><div class="k">Meals collected</div><div class="v">${t.meals_collected}</div></div>
<div class="card"><div class="k">Picked up in safe window</div><div class="v">${t.collected_in_window}</div></div></div>
<h2>Entries</h2><table style="font-size:11.5px"><thead><tr><th>Date</th><th>Record</th><th>Donor</th><th>Food</th><th class="n">Offered</th><th class="n">Collected</th>
<th>Collected by</th><th>Picked up</th><th>Outcome</th><th>Safety</th></tr></thead><tbody>${rows}</tbody></table>
${foot(r)}`;
  return shell(`Donation register ${r.period}`, r.sample, body, true);
}

export function renderHtml(doc: Paperwork): string {
  return doc.kind === "donation_declaration" ? renderDeclaration(doc) : doc.kind === "handover_note" ? renderHandover(doc) : renderRegister(doc);
}

/** The register as CSV (UTF-8, with a BOM so Excel shows Indian-language names correctly). */
export function renderRegisterCsv(r: Register): string {
  const cols = ["date", "doc_no", "offer_id", "donor", "donor_fssai", "food", "diet", "meals_offered", "meals_collected",
    "cooked_at", "safe_until", "collected_by", "picked_up_at", "outcome", "safety_confirmed"] as const;
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s; // also defuses spreadsheet formulas
  };
  return "﻿" + [cols.join(","), ...r.rows.map((row) => cols.map((c) => cell(row[c])).join(","))].join("\r\n") + "\r\n";
}
