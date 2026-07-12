import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ============================================================
// Invoice Reminders API (DOZ OS — Phase 3, Task P3-D)
// Detects overdue invoices, generates WhatsApp + Email reminder
// drafts the founder can copy/send, and surfaces pending
// PaymentConfirmation records needing verification.
//
// GET  -> { stats, overdueInvoices, upcomingInvoices, pendingConfirmations }
// POST -> { action: "mark_reminder_sent" | "verify_payment", ... }
// ============================================================

const COMPANY = {
  name: "Digit One Zero Ltd",
  founder: "Kelvin Keshy",
  title: "Founder & CEO",
  bank: "GTBank — Digit One Zero Ltd — 0123456789",
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatNGN(amount: number): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "₦0";
  return "₦" + amount.toLocaleString("en-NG", { maximumFractionDigits: 0 });
}

function formatDateLong(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function greetingPrefix(date: Date): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Strip common Nigerian honorifics and return the first usable name token.
// e.g. "Dr. Chinyere Alu" -> "Chinyere", "Femi Adeola" -> "Femi"
const HONORIFICS = new Set([
  "dr",
  "dr.",
  "mr",
  "mr.",
  "mrs",
  "mrs.",
  "ms",
  "ms.",
  "engr",
  "engr.",
  "chief",
  "chief.",
  "alhaji",
  "alhaja",
  "hrh",
  "hrh.",
  "prince",
  "princess",
  "pastor",
  "rev",
  "rev.",
  "hon",
  "hon.",
  "sir",
  "lady",
]);

function firstNameOf(fullName: string): string {
  const parts = fullName.split(/\s+/).filter(Boolean);
  for (const p of parts) {
    if (!HONORIFICS.has(p.toLowerCase())) return p;
  }
  return parts[0] ?? fullName;
}

// ----------------------------------------------------------------
// Reminder draft builders (template-based string interpolation)
// ----------------------------------------------------------------
function buildWhatsAppDraft(opts: {
  contactName: string | null;
  invoiceCode: string;
  amount: number;
  dueDate: Date | null;
  daysOverdue: number;
}): string {
  const now = new Date();
  const greet = `${greetingPrefix(now)}${opts.contactName ? `, ${firstNameOf(opts.contactName)}` : ""}`;
  const dueText = opts.dueDate ? formatDateLong(opts.dueDate) : "—";
  const lines: string[] = [];
  lines.push(`${greet},`);
  lines.push("");
  lines.push(
    `This is a friendly reminder that invoice ${opts.invoiceCode} from ${COMPANY.name} (${formatNGN(
      opts.amount
    )}) is now ${opts.daysOverdue} day${opts.daysOverdue === 1 ? "" : "s"} overdue.`
  );
  lines.push("");
  lines.push(`Invoice: ${opts.invoiceCode}`);
  lines.push(`Amount due: ${formatNGN(opts.amount)}`);
  lines.push(`Due date: ${dueText}`);
  lines.push("");
  lines.push(
    "If you've already made payment, please share the transaction reference so we can confirm. Otherwise, kindly process payment at your earliest convenience."
  );
  lines.push("");
  lines.push(`Bank: ${COMPANY.bank}`);
  lines.push("");
  lines.push("Thank you for your partnership.");
  lines.push(COMPANY.founder.split(" ")[0]);
  lines.push(COMPANY.name);
  return lines.join("\n");
}

function buildEmailDraft(opts: {
  contactName: string | null;
  invoiceCode: string;
  amount: number;
  dueDate: Date | null;
  daysOverdue: number;
  accountName: string;
  projectName: string | null;
}): { subject: string; body: string } {
  const dueText = opts.dueDate ? formatDateLong(opts.dueDate) : "—";
  const salute = opts.contactName
    ? `Dear ${opts.contactName},`
    : `Dear ${opts.accountName} Team,`;
  const subject = `Overdue Invoice ${opts.invoiceCode} — ${COMPANY.name} (${formatNGN(opts.amount)})`;

  const body = [
    salute,
    "",
    `I hope this message finds you well.`,
    "",
    `This is a polite follow-up regarding invoice ${opts.invoiceCode} issued to ${opts.accountName}${
      opts.projectName ? ` for the "${opts.projectName}" project` : ""
    }, which is now ${opts.daysOverdue} day${opts.daysOverdue === 1 ? "" : "s"} past its due date.`,
    "",
    "Invoice details:",
    `  • Invoice no:  ${opts.invoiceCode}`,
    `  • Amount due:  ${formatNGN(opts.amount)}`,
    `  • Due date:    ${dueText}`,
    "",
    "Kindly arrange payment at your earliest convenience using the bank details below:",
    "",
    `  Bank:    GTBank`,
    `  Name:    ${COMPANY.name}`,
    `  Account: 0123456789`,
    "",
    "If payment has already been made, please reply with the transaction reference so we can reconcile and update our records accordingly.",
    "",
    "Should you have any questions or require a revised invoice, please do not hesitate to reach out — we value the relationship and are happy to help.",
    "",
    "Thank you for your attention and continued partnership.",
    "",
    "Warm regards,",
    "",
    `${COMPANY.founder}`,
    `${COMPANY.title}`,
    `${COMPANY.name}`,
    "Abuja, Nigeria",
  ].join("\n");

  return { subject, body };
}

// ---------------------------------------------------------------
// GET — overdue invoices + drafts + pending confirmations
// ---------------------------------------------------------------
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Invoice reminders expose outstanding/overdue invoice amounts — FOUNDER-only.
  if (user.role !== "FOUNDER") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const now = new Date();

    // Fetch all invoices with their relations
    const invoices = await db.invoice.findMany({
      include: {
        account: { include: { contacts: true } },
        project: true,
      },
    });

    // Fetch all payment confirmations (PENDING + VERIFIED/REJECTED for stats if needed)
    const confirmations = await db.paymentConfirmation.findMany({
      include: { invoice: true, account: true },
      orderBy: { createdAt: "desc" },
    });

    // ----- OVERDUE invoices -----
    // An invoice is overdue if status === "OVERDUE" OR (not PAID/DRAFT and dueDate < today)
    const overdueInvoicesRaw = invoices
      .filter((inv) => {
        if (inv.status === "PAID" || inv.status === "DRAFT") return false;
        if (inv.status === "OVERDUE") return true;
        if (!inv.dueDate) return false;
        return startOfDay(new Date(inv.dueDate)).getTime() < startOfDay(now).getTime();
      })
      .map((inv) => {
        const daysOverdue = inv.dueDate
          ? daysBetween(now, new Date(inv.dueDate))
          : 0;
        const balance = Math.max(0, inv.amount - inv.amountPaid);
        return { inv, daysOverdue, balance };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue);

    const overdueAmount = overdueInvoicesRaw.reduce((s, o) => s + o.balance, 0);

    // Reminders due today = invoices that either have no reminder sent yet OR
    // last reminder was sent >= 3 days ago.
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    const remindersDueToday = overdueInvoicesRaw.filter(({ inv }) => {
      if (!inv.lastReminderAt) return true;
      return now.getTime() - new Date(inv.lastReminderAt).getTime() >= THREE_DAYS;
    }).length;

    // ----- UPCOMING invoices (due within next 7 days, NOT overdue yet) -----
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const upcomingInvoicesRaw = invoices
      .filter((inv) => {
        if (inv.status === "PAID" || inv.status === "DRAFT" || inv.status === "OVERDUE") return false;
        if (!inv.dueDate) return false;
        const due = startOfDay(new Date(inv.dueDate));
        const today = startOfDay(now);
        return due.getTime() >= today.getTime() && due.getTime() <= startOfDay(sevenDaysLater).getTime();
      })
      .map((inv) => {
        const daysUntilDue = inv.dueDate
          ? daysBetween(new Date(inv.dueDate), now)
          : 0;
        const balance = Math.max(0, inv.amount - inv.amountPaid);
        return { inv, daysUntilDue, balance };
      })
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    // ----- PENDING payment confirmations -----
    const pendingConfirmationsRaw = confirmations.filter(
      (c) => c.status === "PENDING"
    );
    const pendingConfirmationAmount = pendingConfirmationsRaw.reduce(
      (s, c) => s + c.amount,
      0
    );

    // ----- Build overdue invoices payload (with drafts) -----
    const overdueInvoices = overdueInvoicesRaw.map(({ inv, daysOverdue, balance }) => {
      // Find primary contact: prefer decision-maker on the account, else any contact, else null
      const contacts = inv.account?.contacts ?? [];
      const decisionMaker = contacts.find((c) => c.isDecisionMaker) ?? contacts[0] ?? null;
      const contact = decisionMaker
        ? { name: decisionMaker.name, phone: decisionMaker.phone, email: decisionMaker.email }
        : null;

      const whatsappDraft = buildWhatsAppDraft({
        contactName: contact?.name ?? null,
        invoiceCode: inv.code ?? "—",
        amount: balance,
        dueDate: inv.dueDate,
        daysOverdue,
      });
      const emailDraft = buildEmailDraft({
        contactName: contact?.name ?? null,
        invoiceCode: inv.code ?? "—",
        amount: balance,
        dueDate: inv.dueDate,
        daysOverdue,
        accountName: inv.account?.name ?? "—",
        projectName: inv.project?.name ?? null,
      });

      return {
        id: inv.id,
        code: inv.code ?? "—",
        amount: inv.amount,
        amountPaid: inv.amountPaid,
        balance,
        status: inv.status,
        issuedDate: inv.issuedDate,
        dueDate: inv.dueDate,
        daysOverdue,
        reminderCount: inv.reminderCount,
        lastReminderAt: inv.lastReminderAt,
        account: {
          name: inv.account?.name ?? "—",
          isStrategic: inv.account?.isStrategic ?? false,
        },
        project: {
          name: inv.project?.name ?? "—",
        },
        contact,
        whatsappDraft,
        emailDraft,
      };
    });

    // ----- Build upcoming invoices payload -----
    const upcomingInvoices = upcomingInvoicesRaw.map(({ inv, daysUntilDue, balance }) => ({
      id: inv.id,
      code: inv.code ?? "—",
      amount: inv.amount,
      balance,
      dueDate: inv.dueDate,
      daysUntilDue,
      account: { name: inv.account?.name ?? "—" },
    }));

    // ----- Build pending confirmations payload -----
    const pendingConfirmations = pendingConfirmationsRaw.map((c) => ({
      id: c.id,
      amount: c.amount,
      method: c.method,
      reference: c.reference,
      note: c.note,
      status: c.status,
      createdAt: c.createdAt,
      invoice: {
        id: c.invoiceId,
        code: c.invoice.code ?? "—",
        amount: c.invoice.amount,
        amountPaid: c.invoice.amountPaid,
        balance: Math.max(0, c.invoice.amount - c.invoice.amountPaid),
        status: c.invoice.status,
      },
      account: { name: c.account?.name ?? "—" },
    }));

    return NextResponse.json({
      stats: {
        overdueCount: overdueInvoices.length,
        overdueAmount,
        remindersDueToday,
        pendingConfirmations: pendingConfirmations.length,
        pendingConfirmationAmount,
      },
      overdueInvoices,
      upcomingInvoices,
      pendingConfirmations,
    });
  } catch (err: any) {
    console.error("[GET /api/doz/reminders] error:", err);
    return NextResponse.json(
      { error: "failed_to_load_reminders", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------
// POST — mark_reminder_sent | verify_payment
// ---------------------------------------------------------------
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const action = body?.action;
  if (!action) {
    return NextResponse.json({ error: "missing_action" }, { status: 400 });
  }

  try {
    // ============================================================
    // 1) mark_reminder_sent — increment reminderCount + set lastReminderAt
    // ============================================================
    if (action === "mark_reminder_sent") {
      const invoiceId = body?.invoiceId;
      if (!invoiceId || typeof invoiceId !== "string") {
        return NextResponse.json({ error: "missing_invoiceId" }, { status: 400 });
      }

      const existing = await db.invoice.findUnique({ where: { id: invoiceId } });
      if (!existing) {
        return NextResponse.json({ error: "invoice_not_found" }, { status: 404 });
      }

      const updated = await db.invoice.update({
        where: { id: invoiceId },
        data: {
          reminderCount: { increment: 1 },
          lastReminderAt: new Date(),
        },
      });

      // Log activity
      await db.activityLog.create({
        data: {
          userId: user.id,
          action: "Sent invoice reminder",
          entityType: "INVOICE",
          entityId: invoiceId,
          detail: `Invoice ${updated.code ?? "—"} — reminder #${updated.reminderCount}`,
        },
      });

      return NextResponse.json({ invoice: updated });
    }

    // ============================================================
    // 2) verify_payment — verify or reject a PaymentConfirmation
    //    On verify: also update the related Invoice.amountPaid (+status)
    //    FOUNDER-only — this modifies invoice payment status.
    // ============================================================
    if (action === "verify_payment") {
      if (user.role !== "FOUNDER") {
        return NextResponse.json({ error: "forbidden — founder only" }, { status: 403 });
      }
      const confirmationId = body?.confirmationId;
      const subAction = body?.subAction; // "verify" | "reject"

      if (!confirmationId || typeof confirmationId !== "string") {
        return NextResponse.json(
          { error: "missing_confirmationId" },
          { status: 400 }
        );
      }
      if (subAction !== "verify" && subAction !== "reject") {
        return NextResponse.json(
          { error: "invalid_subAction", detail: "expected 'verify' or 'reject'" },
          { status: 400 }
        );
      }

      const confirmation = await db.paymentConfirmation.findUnique({
        where: { id: confirmationId },
        include: { invoice: true },
      });
      if (!confirmation) {
        return NextResponse.json(
          { error: "confirmation_not_found" },
          { status: 404 }
        );
      }
      if (confirmation.status !== "PENDING") {
        return NextResponse.json(
          {
            error: "already_processed",
            detail: `Confirmation is already ${confirmation.status}`,
          },
          { status: 409 }
        );
      }

      // ---- REJECT branch ----
      if (subAction === "reject") {
        const updated = await db.paymentConfirmation.update({
          where: { id: confirmationId },
          data: { status: "REJECTED" },
          include: { invoice: true, account: true },
        });

        await db.activityLog.create({
          data: {
            userId: user.id,
            action: "Rejected payment confirmation",
            entityType: "INVOICE",
            entityId: confirmation.invoiceId,
            detail: `Rejected ₦${confirmation.amount.toLocaleString("en-NG")} for invoice ${
              confirmation.invoice?.code ?? "—"
            }`,
          },
        });

        return NextResponse.json({ confirmation: updated });
      }

      // ---- VERIFY branch ----
      // Use a transaction to atomically update the confirmation + invoice
      const result = await db.$transaction(async (tx) => {
        const updatedConfirmation = await tx.paymentConfirmation.update({
          where: { id: confirmationId },
          data: { status: "VERIFIED" },
          include: { invoice: true, account: true },
        });

        const inv = confirmation.invoice;
        const newAmountPaid = inv.amountPaid + confirmation.amount;
        const newBalance = inv.amount - newAmountPaid;

        let newStatus = inv.status;
        let paidDate = inv.paidDate;
        if (newBalance <= 0.0001) {
          newStatus = "PAID";
          paidDate = new Date();
        } else if (newAmountPaid > 0) {
          newStatus = "PARTIAL";
        }

        const updatedInvoice = await tx.invoice.update({
          where: { id: inv.id },
          data: {
            amountPaid: newAmountPaid,
            status: newStatus,
            paidDate,
          },
        });

        return { confirmation: updatedConfirmation, invoice: updatedInvoice };
      });

      // Log activity (outside transaction)
      await db.activityLog.create({
        data: {
          userId: user.id,
          action: "Verified payment confirmation",
          entityType: "INVOICE",
          entityId: confirmation.invoiceId,
          detail: `Verified ₦${confirmation.amount.toLocaleString("en-NG")} for invoice ${
            confirmation.invoice?.code ?? "—"
          } → ${result.invoice.status}`,
        },
      });

      return NextResponse.json({
        confirmation: result.confirmation,
        invoice: result.invoice,
      });
    }

    return NextResponse.json(
      { error: "unknown_action", detail: `Action '${action}' is not supported` },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("[POST /api/doz/reminders] error:", err);
    return NextResponse.json(
      { error: "failed_to_process", detail: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}
