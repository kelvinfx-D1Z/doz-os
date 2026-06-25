"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  FileText,
  Calendar,
  Shield,
  Truck,
  GraduationCap,
  Settings,
  Search,
  ExternalLink,
  Tag,
  RefreshCw,
  Hash,
  Clock,
  User,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StatCard, SectionHeader, EmptyState } from "@/components/doz/ui-primitives";
import { formatDate, relativeTime } from "@/lib/format";
import ReactMarkdown from "react-markdown";

// ---------- Types ----------
type SopAuthor = { name: string } | null;

interface SopItem {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string | null;
  author: SopAuthor;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface SopCategory {
  name: string;
  display: string;
  icon: string;
  count: number;
}

interface SopStats {
  totalSops: number;
  byCategory: Record<string, number>;
  lastUpdated: string | null;
}

interface SopResponse {
  stats: SopStats;
  sops: SopItem[];
  categories: SopCategory[];
}

// ---------- Category config ----------
interface CatConfig {
  display: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeClass: string;
  dotClass: string;
}

const CATEGORY_CONFIG: Record<string, CatConfig> = {
  EVENT_CHECKLIST: {
    display: "Event Checklists",
    icon: Calendar,
    badgeClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
    dotClass: "bg-emerald-500",
  },
  PROPOSAL_TEMPLATE: {
    display: "Proposal Templates",
    icon: FileText,
    badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20",
    dotClass: "bg-amber-500",
  },
  PROCUREMENT_POLICY: {
    display: "Procurement Policies",
    icon: Shield,
    badgeClass: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20",
    dotClass: "bg-rose-500",
  },
  VENDOR_SOP: {
    display: "Vendor SOPs",
    icon: Truck,
    badgeClass: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/20",
    dotClass: "bg-teal-500",
  },
  TRAINING: {
    display: "Training Materials",
    icon: GraduationCap,
    badgeClass: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/20",
    dotClass: "bg-violet-500",
  },
  PROCESS: {
    display: "Company Processes",
    icon: Settings,
    badgeClass: "bg-muted text-muted-foreground border border-border",
    dotClass: "bg-muted-foreground",
  },
};

function catConfig(category: string): CatConfig {
  return (
    CATEGORY_CONFIG[category] ?? {
      display: category.replace(/_/g, " "),
      icon: BookOpen,
      badgeClass: "bg-muted text-muted-foreground border border-border",
      dotClass: "bg-muted-foreground",
    }
  );
}

function parseTags(tags: string | null): string[] {
  if (!tags) return [];
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function preview(content: string, max = 150): string {
  // Strip markdown headings/markdown symbols for the preview
  const plain = content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>-]/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? plain.slice(0, max) + "…" : plain;
}

// ---------- Markdown renderer ----------
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="text-sm leading-relaxed text-foreground/90 space-y-3">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold tracking-tight text-foreground border-b border-border pb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-bold tracking-tight text-foreground mt-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground/80 mt-2">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="text-sm text-foreground/90">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/90">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 space-y-1 text-sm text-foreground/90">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
          code: ({ children }) => (
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground">
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="rounded-md border border-border bg-muted/50 p-3 overflow-x-auto text-[12px]">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/50 pl-3 italic text-muted-foreground">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-border" />,
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-muted/60 text-foreground">{children}</thead>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-3 py-2 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border/60 px-3 py-2 text-foreground/90">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ---------- Sop Card ----------
function SopCard({ sop, onOpen }: { sop: SopItem; onOpen: (s: SopItem) => void }) {
  const cfg = catConfig(sop.category);
  const Icon = cfg.icon;
  const tags = parseTags(sop.tags);
  return (
    <Card className="flex flex-col p-5 gap-3 transition-all hover:border-primary/40 hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Badge className={cfg.badgeClass + " font-medium uppercase tracking-wide"}>
          <Icon className="h-3 w-3 mr-1" />
          {cfg.display}
        </Badge>
        <span className="text-[10px] text-muted-foreground font-mono">v{sop.version}</span>
      </div>

      <h3 className="font-semibold text-base leading-snug line-clamp-2">{sop.title}</h3>

      <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
        {preview(sop.content)}
      </p>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 4).map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              <Tag className="h-2.5 w-2.5" />
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground min-w-0">
          <span className="inline-flex items-center gap-1 truncate">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{sop.author?.name ?? "—"}</span>
          </span>
          <span className="text-muted-foreground/40">•</span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <Clock className="h-3 w-3 shrink-0" />
            {relativeTime(sop.updatedAt)}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={() => onOpen(sop)}
        >
          <ExternalLink className="h-3 w-3 mr-1" />
          Open
        </Button>
      </div>
    </Card>
  );
}

// ---------- Loading skeleton ----------
function SkeletonGrid() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-16" />
          </Card>
        ))}
      </div>
      <div className="grid lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1 space-y-3">
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
        <div className="lg:col-span-3 space-y-4">
          <Skeleton className="h-10 w-full" />
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-44 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Main ----------
export function SopKnowledge() {
  const [data, setData] = useState<SopResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SopItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/doz/sop", { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load SOPs");
        const json: SopResponse = await res.json();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSops = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.sops.filter((s) => {
      if (activeCategory !== "ALL" && s.category !== activeCategory) return false;
      if (!q) return true;
      const inTitle = s.title.toLowerCase().includes(q);
      const inContent = s.content.toLowerCase().includes(q);
      const inTags = (s.tags ?? "").toLowerCase().includes(q);
      return inTitle || inContent || inTags;
    });
  }, [data, activeCategory, search]);

  // Stats for KPIs
  const totalSops = data?.stats.totalSops ?? 0;
  const categoryCount = data?.categories.length ?? 0;
  const proposalCount = data?.stats.byCategory.PROPOSAL_TEMPLATE ?? 0;
  const lastUpdated = data?.stats.lastUpdated;

  if (loading) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="SOP & Knowledge Base"
          description="Templates, checklists, policies, and training materials for the DOZ OS team."
          icon={<BookOpen className="h-5 w-5" />}
        />
        <SkeletonGrid />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <SectionHeader
          title="SOP & Knowledge Base"
          description="Templates, checklists, policies, and training materials for the DOZ OS team."
          icon={<BookOpen className="h-5 w-5" />}
        />
        <EmptyState
          icon={<BookOpen className="h-10 w-10" />}
          title="Couldn't load SOPs"
          hint={error ?? "Please try again later."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title="SOP & Knowledge Base"
        description="Templates, checklists, policies, and training materials for the DOZ OS team."
        icon={<BookOpen className="h-5 w-5" />}
        action={
          <Button variant="outline" size="sm" asChild>
            <a href="/api/doz/sop" target="_blank" rel="noreferrer">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </a>
          </Button>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total SOPs"
          value={totalSops}
          sub="across all categories"
          icon={<BookOpen className="h-4 w-4" />}
          accent="primary"
        />
        <StatCard
          label="Categories"
          value={categoryCount}
          sub="documented areas"
          icon={<Hash className="h-4 w-4" />}
        />
        <StatCard
          label="Proposal Templates"
          value={proposalCount}
          sub="ready to reuse"
          icon={<FileText className="h-4 w-4" />}
          accent="warning"
        />
        <StatCard
          label="Last Updated"
          value={lastUpdated ? relativeTime(lastUpdated) : "—"}
          sub={lastUpdated ? formatDate(lastUpdated) : "no records"}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Main layout */}
      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar — category filter */}
        <aside className="lg:col-span-1">
          <Card className="p-3">
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Categories
            </p>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-1 pr-1">
                <button
                  onClick={() => setActiveCategory("ALL")}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    activeCategory === "ALL"
                      ? "bg-primary text-primary-foreground font-medium"
                      : "hover:bg-accent text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    All SOPs
                  </span>
                  <span
                    className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                      activeCategory === "ALL"
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {totalSops}
                  </span>
                </button>

                {data.categories.map((cat) => {
                  const cfg = catConfig(cat.name);
                  const Icon = cfg.icon;
                  const active = activeCategory === cat.name;
                  return (
                    <button
                      key={cat.name}
                      onClick={() => setActiveCategory(cat.name)}
                      className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground font-medium"
                          : "hover:bg-accent text-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{cfg.display}</span>
                      </span>
                      <span
                        className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold ${
                          active
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {cat.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </Card>
        </aside>

        {/* Right content */}
        <div className="lg:col-span-3 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SOPs by title, content, or tag…"
              className="pl-9"
            />
          </div>

          {/* Result meta */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing{" "}
              <span className="font-semibold text-foreground">{filteredSops.length}</span>{" "}
              of {totalSops} SOPs
              {activeCategory !== "ALL" && (
                <>
                  {" "}
                  in{" "}
                  <span className="font-semibold text-foreground">
                    {catConfig(activeCategory).display}
                  </span>
                </>
              )}
              {search.trim() && (
                <>
                  {" "}
                  matching &ldquo;<span className="text-foreground">{search.trim()}</span>&rdquo;
                </>
              )}
            </span>
            {(activeCategory !== "ALL" || search.trim()) && (
              <button
                onClick={() => {
                  setActiveCategory("ALL");
                  setSearch("");
                }}
                className="text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* SOP grid */}
          {filteredSops.length === 0 ? (
            <EmptyState
              icon={<Search className="h-10 w-10" />}
              title="No SOPs match your filters"
              hint="Try a different category or clear the search."
            />
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {filteredSops.map((s) => (
                <SopCard key={s.id} sop={s} onOpen={(sop) => setSelected(sop)} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Markdown detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          {selected && (
            <>
              <DialogHeader className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(() => {
                    const cfg = catConfig(selected.category);
                    const Icon = cfg.icon;
                    return (
                      <Badge className={cfg.badgeClass + " font-medium uppercase tracking-wide"}>
                        <Icon className="h-3 w-3 mr-1" />
                        {cfg.display}
                      </Badge>
                    );
                  })()}
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                    v{selected.version}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Updated {relativeTime(selected.updatedAt)}
                  </span>
                </div>
                <DialogTitle className="text-xl font-bold leading-tight">
                  {selected.title}
                </DialogTitle>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {selected.author?.name ?? "—"}
                  </span>
                  <span className="text-muted-foreground/40">•</span>
                  <span>Created {formatDate(selected.createdAt)}</span>
                  <span className="text-muted-foreground/40">•</span>
                  <span>Last updated {formatDate(selected.updatedAt)}</span>
                </div>
                {parseTags(selected.tags).length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {parseTags(selected.tags).map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-0.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        <Tag className="h-2.5 w-2.5" />
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </DialogHeader>

              <ScrollArea className="flex-1 pr-2 max-h-[60vh]">
                <div className="pr-4 pb-4">
                  <MarkdownContent content={selected.content} />
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
