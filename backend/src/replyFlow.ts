// Shared by REST /reply and Telegram free text: understand -> log -> apply via the fixed table.
import { db } from "./db/db";
import { addEvent, getAssignmentRow, getOfferRow, getRecipient, updateAssignment } from "./db/repo";
import { pct } from "./domain/format";
import { applyReply } from "./domain/replies";
import { offerDetail } from "./domain/timeline";
import { AppError, type OfferDetail, type ReplyUnderstanding } from "./domain/types";
import { understandReply } from "./ai/understandReply";

const INTENT_LABEL: Record<string, string> = {
  accept_full: "accepting all", accept_partial: "accepting some", decline: "declining", cancel: "cancelling",
  still_coming: "still coming", running_late: "running late", question: "a question / unclear",
};

export async function handleReply(assignmentId: string, text: string): Promise<{ understood: ReplyUnderstanding; offer: OfferDetail }> {
  const a = getAssignmentRow(assignmentId);
  if (!a) throw new AppError(404, "NOT_FOUND", `Assignment ${assignmentId} not found`);
  const offer = getOfferRow(a.offer_id)!;
  const u = await understandReply(text, a, offer);

  const who = getRecipient(a.recipient_id)?.name ?? "Recipient";
  const quoted = text.length > 80 ? `${text.slice(0, 77)}...` : text;
  const head = `${who}: '${quoted}' → ${INTENT_LABEL[u.intent]} (${pct(u.intent_probability)}), at-risk ${pct(u.at_risk_probability)}.`;
  const ev = addEvent(a.offer_id, "reply_understood", head, a.id);

  const { action_taken } = applyReply(a.id, { ...u, action_taken: "" });
  const understood: ReplyUnderstanding = { ...u, action_taken };
  updateAssignment(a.id, { last_reply_json: JSON.stringify(understood) });
  db.prepare("UPDATE events SET message = ? WHERE id = ?").run(`${head} ${action_taken}.`, ev.id);

  return { understood, offer: offerDetail(a.offer_id) };
}
