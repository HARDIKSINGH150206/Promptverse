import { Bot, InlineKeyboard, type Context } from "grammy";
import { config } from "../config";
import {
  getAssignmentRow, getOfferRow, getRecipient, getRecipientByChat, getRecipientByLinkCode, getRestaurant,
  linkTelegram, listAssignmentRows, listAssignmentsForRecipient, listRecipientRows,
} from "../db/repo";
import { fmtTime, pct } from "../domain/format";
import { setNotifySink, type Notice } from "../domain/notify";
import { STANDBY_LIVE } from "../domain/offerState";
import { REPLYABLE } from "../domain/replies";
import { applyAction } from "../domain/transitions";
import { AppError, type AssignmentAction, type AssignmentRow, type ReplyUnderstanding } from "../domain/types";
import { handleReply } from "../replyFlow";

let bot: Bot | null = null;
let running = false;

export function telegramStatus(): "ready" | "disabled" {
  return running ? "ready" : "disabled";
}

const CB: Record<string, AssignmentAction> = {
  acc: "accept", dec: "decline", rec: "reconfirm", can: "cancel", col: "collected", sba: "standby_accept", sbd: "standby_decline",
};

function keyboardFor(a: AssignmentRow): InlineKeyboard | undefined {
  const k = new InlineKeyboard();
  switch (a.status) {
    case "offered": return k.text("Accept", `acc:${a.id}`).text("Decline", `dec:${a.id}`);
    case "reconfirm_sent": return k.text("Still coming", `rec:${a.id}`).text("Cancel", `can:${a.id}`);
    case "accepted":
    case "confirmed": return k.text("Collected", `col:${a.id}`).text("Cancel", `can:${a.id}`);
    case "standby_requested": return k.text("I can stand by", `sba:${a.id}`).text("Not today", `sbd:${a.id}`);
    default: return undefined;
  }
}

function describe(a: AssignmentRow, kind?: Notice["kind"]): string {
  const offer = getOfferRow(a.offer_id)!;
  const rest = getRestaurant(offer.restaurant_id);
  const items = (JSON.parse(offer.items_json) as { name: string }[]).map((i) => i.name).join(", ");
  const food = `${a.meals} ${offer.diet === "veg" ? "veg" : "non-veg"} meals${items ? ` (${items})` : ""} from ${rest?.name ?? "a restaurant"}`;
  const where = `${a.distance_km} km away. Safe until ${fmtTime(offer.safe_until)}.${offer.pickup_notes ? ` Pickup: ${offer.pickup_notes}.` : ""}`;

  if (kind === "promoted") return `You're up! The first collector dropped out. Please collect ${food} now. ${where}`;
  switch (a.status) {
    case "offered": return `New food offer: ${food}. ${where}\nTap a button, or reply in your own words (e.g. "we can only take 10").`;
    case "accepted": return `Accepted: ${food}. ${where}\nTap Collected when you have it.`;
    case "reconfirm_sent": return `Are you still coming for ${food}? ${where}`;
    case "confirmed": return `Confirmed: ${food}. ${where}\nTap Collected when you have it.`;
    case "collected": return `Collected ${a.meals} meals. Thank you!`;
    case "declined": return `Declined ${food}. Thanks for letting us know.`;
    case "cancelled": return `Cancelled your pickup of ${a.meals} meals. Thanks for telling us; we're finding someone else.`;
    case "no_response": return `This offer (${a.meals} meals) has moved on.`;
    case "standby_requested": return `Backup needed: could you stand by for ${food}? You'd only be called if the first collector drops out. ${where}`;
    case "on_standby": return `Thanks, you're on standby for ${food}. We'll message you if you're needed.`;
    case "released": return `Thanks, the backup for ${a.meals} meals isn't needed any more.`;
    default: return food;
  }
}

async function send(chatId: string, a: AssignmentRow, kind?: Notice["kind"]): Promise<void> {
  if (!bot) return;
  await bot.api.sendMessage(chatId, describe(a, kind), { reply_markup: keyboardFor(a) });
}

async function onNotice(n: Notice): Promise<void> {
  const a = getAssignmentRow(n.assignmentId);
  if (!a) return;
  const r = getRecipient(a.recipient_id);
  if (!r?.telegram_chat_id) return;
  await send(r.telegram_chat_id, a, n.kind);
}

export async function startBot(): Promise<void> {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN not set — bot disabled; the web inbox still works.");
    return;
  }
  bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  bot.command("start", async (ctx) => {
    const code = ctx.match?.trim();
    if (!code) {
      // Demo convenience: pick which (simulated) recipient this chat speaks for.
      const k = new InlineKeyboard();
      for (const r of listRecipientRows()) k.text(r.name, `lnk:${r.link_code}`).row();
      await ctx.reply("Welcome to AnnaRelay. Which recipient are you collecting for? (or send /start <link code>)", { reply_markup: k });
      return;
    }
    await link(ctx, code);
  });

  bot.callbackQuery(/^lnk:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await link(ctx, ctx.match[1]);
  });

  bot.on("callback_query:data", async (ctx) => {
    const [code, id] = ctx.callbackQuery.data.split(":");
    const action = CB[code];
    if (!action || !id) {
      await ctx.answerCallbackQuery();
      return;
    }
    try {
      const a0 = getAssignmentRow(id);
      const r = getRecipientByChat(String(ctx.chat?.id));
      if (!a0 || !r || a0.recipient_id !== r.id) throw new AppError(403, "FORBIDDEN", "This offer isn't for this chat.");
      applyAction(id, action);
      await ctx.answerCallbackQuery({ text: "Done" });
      const a = getAssignmentRow(id)!;
      await ctx.editMessageText(describe(a), { reply_markup: keyboardFor(a) });
    } catch (err) {
      const msg = err instanceof AppError ? err.message : "Something went wrong";
      await ctx.answerCallbackQuery({ text: msg.slice(0, 190), show_alert: false });
      const a = getAssignmentRow(id);
      if (a) await ctx.editMessageText(describe(a), { reply_markup: keyboardFor(a) }).catch(() => {});
    }
  });

  bot.on("message:text", async (ctx) => {
    const r = getRecipientByChat(String(ctx.chat.id));
    if (!r) {
      await ctx.reply("This chat isn't linked yet. Send /start <link code>.");
      return;
    }
    const target = listAssignmentsForRecipient(r.id, [...REPLYABLE])[0];
    if (!target) {
      await ctx.reply("You have no active offers right now. We'll message you when food is available.");
      return;
    }
    await ctx.replyWithChatAction("typing").catch(() => {});
    const { understood: u } = await handleReply(target.id, ctx.message.text);
    const a = getAssignmentRow(target.id)!;

    if (u.needs_clarification) {
      await ctx.reply(u.clarification_question ?? "Sorry, could you say that another way?", { reply_markup: keyboardFor(a) });
      return;
    }
    await ctx.reply(confirmation(u, a), { reply_markup: keyboardFor(a) });
  });

  bot.catch((err) => console.warn("[telegram] handler error:", err.message));
  setNotifySink(onNotice);

  bot.start({
    drop_pending_updates: true,
    onStart: (me) => {
      running = true;
      console.log(`[telegram] @${me.username} is running (long polling).`);
    },
  }).catch((err) => {
    running = false;
    console.warn("[telegram] bot stopped:", err?.message ?? err);
  });
}

function confirmation(u: ReplyUnderstanding, a: AssignmentRow): string {
  const sure = `(${pct(u.intent_probability)} sure)`;
  const parts: string[] = [];
  switch (u.intent) {
    case "running_late": parts.push(`Got it: running late${u.eta ? `, arriving ${fmtTime(u.eta)}` : ""} ${sure}.`); break;
    case "accept_partial": parts.push(`Got it: you can take ${u.meals} meals ${sure}.`); break;
    case "accept_full": parts.push(`Got it: you'll take all ${a.meals} meals ${sure}.`); break;
    case "still_coming": parts.push(`Got it: you're on the way ${sure}.`); break;
    case "decline": case "cancel": parts.push(`Got it: you can't make it ${sure}. Thanks for telling us.`); break;
    default: parts.push(`Thanks, we've passed your message on ${sure}.`);
  }
  const backup = listAssignmentRows(a.offer_id).some((x) => x.standby_for_assignment_id === a.id && STANDBY_LIVE.includes(x.status));
  if (backup && !a.is_standby && ["accepted", "reconfirm_sent", "confirmed"].includes(a.status)) {
    parts.push("We've asked a backup to stand by just in case.");
  }
  parts.push(`Action: ${u.action_taken}.`);
  return parts.join(" ");
}

async function link(ctx: Context, code: string): Promise<void> {
  const r = getRecipientByLinkCode(code);
  if (!r || !ctx.chat) {
    await ctx.reply(`Sorry, I don't recognise the code "${code}".`);
    return;
  }
  linkTelegram(r.id, String(ctx.chat.id));
  await ctx.reply(`Linked to ${r.name}. Food offers will arrive here. Tap the buttons, or just reply in your own words (any language).`);
}

export async function stopBot(): Promise<void> {
  if (bot && running) await bot.stop();
  running = false;
}
