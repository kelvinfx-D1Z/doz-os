import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { promises as fs } from "fs";
import path from "path";
import { existsSync } from "fs";

const DB_PATH = path.join(process.cwd(), "db", "custom.db");
const BACKUP_DIR = path.join(process.cwd(), "db", "backups");

// GET — list backups + system info
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "FOUNDER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    let backups: { name: string; size: number; date: string }[] = [];
    if (existsSync(BACKUP_DIR)) {
      const files = await fs.readdir(BACKUP_DIR);
      for (const file of files) {
        if (file.endsWith(".db")) {
          const stat = await fs.stat(path.join(BACKUP_DIR, file));
          backups.push({ name: file, size: stat.size, date: stat.mtime.toISOString() });
        }
      }
      backups.sort((a, b) => b.date.localeCompare(a.date));
    }

    let dbSize = 0;
    if (existsSync(DB_PATH)) {
      dbSize = (await fs.stat(DB_PATH)).size;
    }

    const [users, projects, vendors, opportunities, invoices, tasks] = await Promise.all([
      db.user.count(), db.project.count(), db.vendor.count(),
      db.opportunity.count(), db.invoice.count(), db.task.count(),
    ]);

    return NextResponse.json({
      backups,
      dbInfo: {
        size: dbSize,
        sizeFormatted: dbSize > 1024 * 1024 ? `${(dbSize / 1024 / 1024).toFixed(1)} MB` : `${(dbSize / 1024).toFixed(0)} KB`,
        recordCounts: { users, projects, vendors, opportunities, invoices, tasks },
        totalRecords: users + projects + vendors + opportunities + invoices + tasks,
      },
      version: "v5.0",
    });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed", detail: err?.message }, { status: 500 });
  }
}

// ============================================================
// SECURITY: Validate a backup filename to prevent path traversal.
// Only allows alphanumeric + dash + dot + ".db" extension, and
// ensures the resolved path stays inside BACKUP_DIR.
// ============================================================
function safeBackupPath(backupName: string): string | null {
  if (!backupName || typeof backupName !== "string") return null;
  // Reject any path separators, dots at the start, or weird chars
  if (!/^[\w.\-]+\.db$/.test(backupName)) return null;
  if (backupName.includes("..") || backupName.includes("/") || backupName.includes("\\")) return null;
  const resolved = path.resolve(BACKUP_DIR, backupName);
  const normalizedDir = path.resolve(BACKUP_DIR);
  // Ensure the resolved path is strictly inside BACKUP_DIR
  if (!resolved.startsWith(normalizedDir + path.sep) && resolved !== normalizedDir) return null;
  return resolved;
}

// POST — backup, restore, or delete backup.
// NOTE: The file-upload "apply update" flow has been DISABLED for security.
// It ran `bun install` (executing attacker-supplied postinstall scripts),
// overwrote prisma/schema.prisma, and used shell `cp -r` — all RCE vectors.
// Updates should be deployed via CI/CD, not via an in-app file upload.
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "FOUNDER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await req.json();
    if (body.action === "backup") return await createBackup();
    if (body.action === "restore") return await restoreBackup(body.backupName);
    if (body.action === "delete_backup") {
      if (!body.backupName) return NextResponse.json({ error: "backupName required" }, { status: 400 });
      const fp = safeBackupPath(body.backupName);
      if (!fp) return NextResponse.json({ error: "invalid backup name" }, { status: 400 });
      if (!existsSync(fp)) return NextResponse.json({ error: "not found" }, { status: 404 });
      await fs.unlink(fp);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  // Reject file uploads — the applyUpdate flow is disabled for security.
  if (contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      {
        error: "In-app file uploads are disabled for security. Deploy updates via your CI/CD pipeline or version control. Database backup and restore remain available below.",
      },
      { status: 403 },
    );
  }

  return NextResponse.json({ error: "unsupported" }, { status: 400 });
}

async function createBackup() {
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = `backup-${ts}.db`;
    const fp = path.join(BACKUP_DIR, name);
    if (!existsSync(DB_PATH)) return NextResponse.json({ error: "db not found" }, { status: 404 });
    await fs.copyFile(DB_PATH, fp);
    const stat = await fs.stat(fp);
    // Keep last 10
    const files = (await fs.readdir(BACKUP_DIR)).filter(f => f.endsWith(".db")).sort().reverse();
    for (const old of files.slice(10)) await fs.unlink(path.join(BACKUP_DIR, old));
    return NextResponse.json({ ok: true, backup: { name, size: stat.size, date: new Date().toISOString() }, message: `Backup created: ${name}` });
  } catch (err: any) {
    return NextResponse.json({ error: "Backup failed", detail: err?.message }, { status: 500 });
  }
}

async function restoreBackup(backupName: string) {
  if (!backupName) return NextResponse.json({ error: "backupName required" }, { status: 400 });
  const bp = safeBackupPath(backupName);
  if (!bp) return NextResponse.json({ error: "invalid backup name" }, { status: 400 });
  if (!existsSync(bp)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const safety = `pre-restore-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.db`;
    if (existsSync(DB_PATH)) await fs.copyFile(DB_PATH, path.join(BACKUP_DIR, safety));
    await fs.copyFile(bp, DB_PATH);
    return NextResponse.json({ ok: true, message: `Restored from ${backupName}. Safety backup: ${safety}. Restart server.` });
  } catch (err: any) {
    return NextResponse.json({ error: "Restore failed", detail: err?.message }, { status: 500 });
  }
}
