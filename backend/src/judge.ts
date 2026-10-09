// Judge mode: a judge scans a QR code, opens the Telegram bot, and becomes a (simulated-history) shelter
// close to the demo restaurant. When food is listed on stage, the offer lands on the judge's own phone.
import crypto from "node:crypto";
import QRCode from "qrcode";
import { config } from "./config";
import { db } from "./db/db";
import { getRecipient, insertDemand, linkTelegram } from "./db/repo";
import { demandDeadline } from "./db/seed";
import { bus } from "./realtime/bus";
import type { RecipientRow } from "./domain/types";

export const JUDGE_START = "JUDGE";
const KK = { lat: 12.9352, lng: 77.6245 }; // Koramangala Kitchen

export function judgeLink(): string | null {
  return config.TELEGRAM_BOT_USERNAME ? `https://t.me/${config.TELEGRAM_BOT_USERNAME}?start=${JUDGE_START}` : null;
}

export async function judgeQrSvg(): Promise<string | null> {
  const link = judgeLink();
  return link ? QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b1f2a", light: "#ffffff" } }) : null;
}

export function listJudges(): RecipientRow[] {
  return db.prepare("SELECT * FROM recipients WHERE id LIKE 'rc_judge_%' ORDER BY rowid").all() as RecipientRow[];
}

/** Create (or re-link) the judge's shelter and give it an open demand. */
export function joinAsJudge(chatId: string, firstName: string | undefined): RecipientRow {
  const id = `rc_judge_${crypto.createHash("sha1").update(chatId).digest("hex").slice(0, 8)}`;
  const n = listJudges().length;
  let r = getRecipient(id);
  if (!r) {
    const who = (firstName ?? "Judge").replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 24) || "Judge";
    // ~0.8 km from the restaurant, spread out so pins don't overlap
    const angle = (n * 67 * Math.PI) / 180;
    const km = 0.8;
    const lat = KK.lat + (km * Math.cos(angle)) / 111.32;
    const lng = KK.lng + (km * Math.sin(angle)) / (111.32 * Math.cos((KK.lat * Math.PI) / 180));
    db.prepare(
      `INSERT INTO recipients (id, name, type, area, lat, lng, telegram_chat_id, link_code, completed, cancelled, no_show, avg_response_secs, is_simulated_history)
       VALUES (?, ?, 'shelter', 'Koramangala (judge)', ?, ?, NULL, ?, 14, 1, 0, 90, 1)`
    ).run(id, `${who}'s Shelter`, lat, lng, `JUDGE${crypto.randomBytes(2).toString("hex").toUpperCase()}`);
    r = getRecipient(id)!;
  }
  linkTelegram(id, chatId);
  ensureJudgeDemand(id);
  bus.emitBus("board_changed");
  return getRecipient(id)!;
}

export function ensureJudgeDemand(recipientId: string): void {
  const open = db
    .prepare("SELECT COUNT(*) AS n FROM demands WHERE recipient_id = ? AND status IN ('open','partially_matched')")
    .get(recipientId) as { n: number };
  if (open.n === 0) {
    insertDemand({
      recipient_id: recipientId, people_count: 20, diet: "any", needed_by: demandDeadline(),
      max_distance_km: 5, notes: "Judge shelter (simulated demand)", raw_transcript: null,
    });
  }
}
