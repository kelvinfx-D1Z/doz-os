# Task 11 — SOP & Knowledge Base Builder

## Task
Build Module 8 (SOP & Knowledge Base) for DOZ OS: API route + UI component.

## Files
- `/home/z/my-project/src/app/api/doz/sop/route.ts` (GET)
- `/home/z/my-project/src/components/modules/sop-knowledge.tsx` (overwrote stub, `"use client"`, `export function SopKnowledge()`)

## Work Log

### API (route.ts)
- `import { db } from "@/lib/db"` and `NextResponse`.
- `db.sop.findMany({ include: { author: { select: { name: true } } }, orderBy: [{ updatedAt: "desc" }, { title: "asc" }] })`.
- `CATEGORY_META` constant array of all 6 categories with icon + display name (EVENT_CHECKLIST → Calendar / Event Checklists, PROPOSAL_TEMPLATE → FileText / Proposal Templates, PROCUREMENT_POLICY → Shield / Procurement Policies, VENDOR_SOP → Truck / Vendor SOPs, TRAINING → GraduationCap / Training Materials, PROCESS → Settings / Company Processes).
- Computes `byCategory` counts, `categories` derived list (name + display + icon + count), `lastUpdated` ISO from newest `updatedAt`.
- Returns `{ stats: { totalSops, byCategory, lastUpdated }, sops: [...], categories: [...] }` exactly per spec.
- try/catch with console.error + 500 fallback.

### UI (sop-knowledge.tsx)
- "use client", `export function SopKnowledge()` no props, fetches `/api/doz/sop` in `useEffect` with cancelled-flag guard.
- `CATEGORY_CONFIG` records each category → `{ display, icon, badgeClass, dotClass }` with the spec'd colors:
  - EVENT_CHECKLIST emerald, PROPOSAL_TEMPLATE amber, PROCUREMENT_POLICY rose, VENDOR_SOP teal, TRAINING violet, PROCESS muted. NO indigo/blue.
- **KPI row (4 StatCards):** Total SOPs (primary accent), Categories (Hash icon), Proposal Templates (warning accent), Last Updated (relativeTime value + formatDate sub).
- **Main layout `grid lg:grid-cols-4 gap-6`:**
  - **Sidebar (lg:col-span-1):** Card with "Categories" header + ScrollArea list. "All SOPs" button at top (BookOpen icon + total count badge). Then one button per category (icon + display name + count badge). Active item highlighted with `bg-primary text-primary-foreground`.
  - **Right content (lg:col-span-3):** Search Input with Search icon (`pl-9`). Result count + "Clear filters" link. Grid `sm:grid-cols-2 gap-4` of SopCards.
- **SopCard:** category badge (colored by category config), title `font-semibold line-clamp-2`, content preview (~150 chars plain-text-stripped of markdown), tags as small Tag-icon badges, footer (author name + version mono + relativeTime), "Open" outline button.
- **Markdown Dialog (sm:max-w-3xl):** `Dialog` controlled with `selected` state. Header has category badge + version + relativeTime updated, then DialogTitle, then author + created + last updated dates, then tags. Body is `ScrollArea max-h-[60vh]` with `MarkdownContent`.
- **MarkdownContent** uses `react-markdown` with custom component overrides (no `@tailwindcss/typography` needed):
  - h1: `text-xl font-bold border-b pb-2`, h2: `text-base font-bold`, h3: `text-sm font-semibold uppercase`.
  - p, ul (list-disc pl-5), ol (list-decimal pl-5), li.
  - strong/em, code (`bg-muted px-1.5 font-mono`), pre (bordered block), blockquote (`border-l-2 border-primary/50 pl-3 italic`), hr.
  - table wrapped in `overflow-x-auto rounded-md border border-border`, th `bg-muted/60 font-semibold`, td `border-b border-border/60`.
  - a: `text-primary underline`.
- **Loading:** `SkeletonGrid` — 4 KPI skeletons, sidebar skeleton, search skeleton, 6 card skeletons mirroring layout.
- **Error:** `EmptyState` with BookOpen icon + error message.
- All cards `p-4`/`p-5`. Long sidebar lists use ScrollArea with `max-h-[60vh]`.

## Testing
- Restarted dev server (port 3000 was busy → killed next-server, restarted, ready in 615ms).
- `curl http://127.0.0.1:3000/api/doz/sop` → HTTP 200, ~5.9KB JSON.
- Verified response shape: `stats.totalSops=7`, `byCategory` matches seed (EVENT_CHECKLIST:1, PROPOSAL_TEMPLATE:1, PROCUREMENT_POLICY:1, VENDOR_SOP:1, TRAINING:1, PROCESS:2), `lastUpdated` ISO present, 7 SOP records (each with id/title/category/content/tags/author:{name}/version/createdAt/updatedAt), 6 categories with correct icon names.
- `GET /` → HTTP 200, page compiles cleanly.
- `npx eslint src/components/modules/sop-knowledge.tsx src/app/api/doz/sop/route.ts --max-warnings=0` → exit 0 (clean). Note: `bun run lint` reports a pre-existing parse error in `src/app/api/doz/team/route.ts` (different module — not my file).

## Stage Summary
- Module 8 (SOP & Knowledge Base) fully implemented.
- API: GET /api/doz/sop returns stats + sops + categories (derived list with icons).
- UI: 4 StatCards + sidebar category filter + search + SOP card grid + Markdown dialog. Reusable layout pattern matches other modules.
- Color discipline: emerald primary, amber warning, rose danger, teal/violet accent for categories. NO indigo/blue.
- Files: `src/app/api/doz/sop/route.ts` (new), `src/components/modules/sop-knowledge.tsx` (overwrote stub with ~480 lines).
