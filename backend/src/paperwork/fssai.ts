// FSSAI licence / registration numbers. They are 14 digits; as commonly documented, the first digit
// is 1 for a licence (state or central) and 2 for a basic registration, digits 2-3 are the state
// code, 4-5 the year of issue, 6-8 the enrolling office and 9-14 the business's own number.
// This is a FORMAT check only. It cannot tell whether a number is real, current or belongs to this
// business; that needs a lookup on FSSAI's FoSCoS portal, which documents show as "not verified".

export interface FssaiCheck {
  valid: boolean;
  normalized: string | null; // 14 digits, spaces and dashes removed
  kind: "licence" | "registration" | "unknown";
  state_code: string | null;
  year: number | null;
  reason: string | null; // why it isn't valid
}

export function checkFssai(raw: string | null | undefined, nowYear = new Date().getFullYear()): FssaiCheck {
  const bad = (reason: string, normalized: string | null = null): FssaiCheck => ({
    valid: false, normalized, kind: "unknown", state_code: null, year: null, reason,
  });
  if (!raw || !raw.trim()) return bad("No FSSAI number on file");
  const n = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(n)) return bad("FSSAI numbers contain digits only", n);
  if (n.length !== 14) return bad(`FSSAI numbers have 14 digits, this has ${n.length}`, n);
  const kind = n[0] === "1" ? "licence" : n[0] === "2" ? "registration" : "unknown";
  if (kind === "unknown") return bad("FSSAI numbers start with 1 (licence) or 2 (registration)", n);
  const year = 2000 + Number(n.slice(3, 5));
  if (year < 2006 || year > nowYear) return bad(`Year of issue 20${n.slice(3, 5)} isn't possible`, n); // the FSS Act is from 2006
  return { valid: true, normalized: n, kind, state_code: n.slice(1, 3), year, reason: null };
}

/** "12345678901234" -> "1 23 45 678 901234", the way it's printed on certificates. */
export function formatFssai(n: string): string {
  return n.length === 14 ? `${n[0]} ${n.slice(1, 3)} ${n.slice(3, 5)} ${n.slice(5, 8)} ${n.slice(8)}` : n;
}
