import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Categories with metadata for the UI sidebar
const CATEGORY_META: { name: string; icon: string; display: string }[] = [
  { name: "EVENT_CHECKLIST", icon: "Calendar", display: "Event Checklists" },
  { name: "PROPOSAL_TEMPLATE", icon: "FileText", display: "Proposal Templates" },
  { name: "PROCUREMENT_POLICY", icon: "Shield", display: "Procurement Policies" },
  { name: "VENDOR_SOP", icon: "Truck", display: "Vendor SOPs" },
  { name: "TRAINING", icon: "GraduationCap", display: "Training Materials" },
  { name: "PROCESS", icon: "Settings", display: "Company Processes" },
];

export async function GET() {
  try {
    const sops = await db.sop.findMany({
      include: {
        author: { select: { name: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    });

    // Build byCategory counts
    const byCategory: Record<string, number> = {};
    for (const c of CATEGORY_META) byCategory[c.name] = 0;
    for (const s of sops) {
      byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
    }

    // Categories with counts (derived list, only those that exist in CATEGORY_META)
    const categories = CATEGORY_META.map((c) => ({
      name: c.name,
      display: c.display,
      icon: c.icon,
      count: byCategory[c.name] ?? 0,
    }));

    // Last updated = most recent updatedAt
    const lastUpdated =
      sops.length > 0 ? sops[0].updatedAt.toISOString() : null;

    const stats = {
      totalSops: sops.length,
      byCategory,
      lastUpdated,
    };

    const payload = sops.map((s) => ({
      id: s.id,
      title: s.title,
      category: s.category,
      content: s.content,
      tags: s.tags,
      author: s.author ? { name: s.author.name } : null,
      version: s.version,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    return NextResponse.json({
      stats,
      sops: payload,
      categories,
    });
  } catch (err) {
    console.error("[doz/sop] GET error", err);
    return NextResponse.json(
      { error: "Failed to load SOPs", detail: String(err) },
      { status: 500 }
    );
  }
}
