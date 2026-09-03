// ============================================================
// BACKFILL: make Project.budget agree with the cost sheet
//
// Project.budget used to be typed into the New Project form at creation — the
// one moment nobody knows the number. It is now derived from the project's
// cost lines (SUM quantity x days x unitPrice) and kept in step whenever a
// line moves. This script brings existing projects into line.
//
// DRY RUN BY DEFAULT. It prints what would change and writes nothing. Pass
// --apply to commit, because this OVERWRITES figures the founder typed, and a
// project with no cost lines yet will go to zero. Zero is the honest answer —
// nothing has been costed — but it is a visible change to the finance module
// and should never happen by surprise.
//
// Safe by construction: the only write is Project.budget. No line is touched,
// nothing is deleted, and running it twice changes nothing the second time.
//
// Re-run it after importing or repairing cost lines in bulk.
// ============================================================

import { PrismaClient } from "@prisma/client";
import { projectBudgetFrom, budgetChanged } from "../src/lib/project-figures.ts";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const naira = (n) => "N" + Number(n ?? 0).toLocaleString();

async function main() {
  const projects = await db.project.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, budget: true, revenue: true },
  });
  console.log(`${APPLY ? "APPLYING" : "DRY RUN — nothing will be written"}\n`);
  console.log(`${projects.length} project(s):\n`);

  let changing = 0;
  let toZero = 0;

  for (const p of projects) {
    const lines = await db.projectService.findMany({
      where: { projectId: p.id },
      select: { quantity: true, days: true, unitPrice: true },
    });
    const computed = projectBudgetFrom(lines);
    const differs = budgetChanged(p.budget, computed);
    if (!differs) {
      console.log(`  =  ${p.name}`);
      console.log(`     ${naira(p.budget)} from ${lines.length} line(s) — already correct.`);
      continue;
    }
    changing++;
    if (computed === 0) toZero++;
    console.log(`  ${computed === 0 ? "!" : "~"}  ${p.name}`);
    console.log(`     typed ${naira(p.budget)}  ->  ${naira(computed)} from ${lines.length} cost line(s)` +
      (computed === 0 ? "   << nothing costed yet" : ""));
    if (APPLY) {
      await db.project.update({ where: { id: p.id }, data: { budget: computed } });
    }
  }

  console.log(`\n${changing} project(s) would change` + (APPLY ? " — applied." : ", of which " + toZero + " to zero."));
  if (!APPLY && changing > 0) {
    console.log("Re-run with --apply to commit.");
  }
  console.log("\nRevenue is untouched here. It becomes the accepted quotation's total,");
  console.log("which is a separate step — see docs/superpowers/specs/2026-09-03-budget-first-flow.md");
}

main()
  .catch((e) => {
    console.error("FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
