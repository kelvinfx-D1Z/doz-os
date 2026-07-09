import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { generateProactiveInsights, generateSmartRecommendations } from "@/lib/didi-engine";

// GET — DIDI's proactive monitoring: insights + recommendations + auto-task creation
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const [insights, recommendations] = await Promise.all([
      generateProactiveInsights(user.id),
      generateSmartRecommendations(user.id),
    ]);

    // Auto-create tasks for CRITICAL insights that have autoCreateTask
    const autoTasks = [];
    for (const insight of insights) {
      if (insight.autoCreateTask && (insight.severity === "CRITICAL" || insight.severity === "ACTION")) {
        // Check if a similar task already exists (avoid duplicates)
        const existing = await db.task.findFirst({
          where: {
            title: insight.autoCreateTask.title,
            status: { not: "DONE" },
            createdAt: { gte: new Date(Date.now() - 86400000) }, // within last 24h
          },
        });

        if (!existing) {
          // Find assignee by role if specified
          let assigneeId = user.id;
          if (insight.autoCreateTask.assigneeRole) {
            const assignee = await db.user.findFirst({
              where: { role: insight.autoCreateTask.assigneeRole, isActive: true },
            });
            if (assignee) assigneeId = assignee.id;
          }

          const task = await db.task.create({
            data: {
              title: insight.autoCreateTask.title,
              description: `Auto-created by DIDI: ${insight.message}`,
              assigneeId,
              creatorId: user.id,
              priority: insight.autoCreateTask.priority,
              category: "STRATEGIC",
              dueDate: new Date(Date.now() + 2 * 86400000), // 2 days from now
              status: "TODO",
            },
          });
          autoTasks.push(task);

          // Save as an AI insight for tracking
          await db.aICoachingNudge.create({
            data: {
              category: insight.type,
              message: insight.message,
              severity: insight.severity === "CRITICAL" ? "ACTION" : insight.severity === "WARNING" ? "WARNING" : "INFO",
            },
          });
        }
      }
    }

    // Summary
    const critical = insights.filter(i => i.severity === "CRITICAL").length;
    const warnings = insights.filter(i => i.severity === "WARNING").length;
    const actions = insights.filter(i => i.severity === "ACTION").length;
    const opportunities = insights.filter(i => i.severity === "OPPORTUNITY").length;
    const positive = insights.filter(i => i.severity === "POSITIVE").length;

    return NextResponse.json({
      insights,
      recommendations,
      autoTasksCreated: autoTasks.length,
      summary: {
        critical,
        warnings,
        actions,
        opportunities,
        positive,
        total: insights.length,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[DIDI proactive] error:", err);
    return NextResponse.json(
      { error: "DIDI is temporarily unavailable", details: err?.message },
      { status: 500 },
    );
  }
}
