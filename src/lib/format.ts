// Shared formatting helpers for DOZ OS

export function formatNGN(amount: number, compact = false): string {
  if (amount === null || amount === undefined || isNaN(amount)) return "₦0";
  if (compact) {
    if (Math.abs(amount) >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(2)}M`;
    if (Math.abs(amount) >= 1_000) return `₦${(amount / 1_000).toFixed(0)}K`;
    return `₦${amount.toFixed(0)}`;
  }
  return "₦" + amount.toLocaleString("en-NG", { maximumFractionDigits: 0 });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-NG");
}

export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatShortDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function relativeTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.round(diff / (1000 * 60 * 60 * 24));
  const hours = Math.round(diff / (1000 * 60 * 60));
  if (days < -1) return `${Math.abs(days)}d overdue`;
  if (days === -1) return "1d overdue";
  if (days === 0) return hours <= 0 ? "today" : "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days}d`;
  if (days < 30) return `in ${Math.round(days / 7)}w`;
  return formatDate(date);
}

export function daysUntil(d: string | Date | null | undefined): number {
  if (!d) return Infinity;
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  return Math.round((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function isOverdue(d: string | Date | null | undefined): boolean {
  if (!d) return false;
  const date = typeof d === "string" ? new Date(d) : d;
  return date.getTime() < Date.now();
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Status color mapping helpers
export const STATUS_STYLES: Record<string, string> = {
  // task / generic
  TODO: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-chart-5/15 text-chart-5",
  DONE: "bg-primary/15 text-primary",
  BLOCKED: "bg-destructive/15 text-destructive",
  COMPLETED: "bg-primary/15 text-primary",
  // priority
  URGENT: "bg-destructive/20 text-destructive",
  HIGH: "bg-amber-500/20 text-amber-400",
  MEDIUM: "bg-chart-5/15 text-chart-5",
  LOW: "bg-muted text-muted-foreground",
  // opportunity stages
  DISCOVERY: "bg-muted text-muted-foreground",
  QUALIFIED: "bg-chart-5/15 text-chart-5",
  PROPOSAL: "bg-amber-500/15 text-amber-400",
  NEGOTIATION: "bg-violet-500/15 text-violet-400",
  WON: "bg-primary/15 text-primary",
  LOST: "bg-destructive/15 text-destructive",
  // invoice
  DRAFT: "bg-muted text-muted-foreground",
  SENT: "bg-chart-5/15 text-chart-5",
  PARTIAL: "bg-amber-500/15 text-amber-400",
  PAID: "bg-primary/15 text-primary",
  OVERDUE: "bg-destructive/15 text-destructive",
  // payment
  PENDING: "bg-amber-500/15 text-amber-400",
  APPROVED: "bg-chart-5/15 text-chart-5",
  REJECTED: "bg-destructive/15 text-destructive",
};

export function statusStyle(status: string): string {
  return STATUS_STYLES[status] ?? "bg-muted text-muted-foreground";
}

export function avatarColor(name: string): string {
  const colors = [
    "bg-emerald-500/20 text-emerald-300",
    "bg-amber-500/20 text-amber-300",
    "bg-rose-500/20 text-rose-300",
    "bg-violet-500/20 text-violet-300",
    "bg-teal-500/20 text-teal-300",
    "bg-fuchsia-500/20 text-fuchsia-300",
    "bg-lime-500/20 text-lime-300",
    "bg-orange-500/20 text-orange-300",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
