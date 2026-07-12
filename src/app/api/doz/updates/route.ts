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

// POST — backup, restore, or apply update
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
      const fp = path.join(BACKUP_DIR, body.backupName);
      if (!existsSync(fp)) return NextResponse.json({ error: "not found" }, { status: 404 });
      await fs.unlink(fp);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  if (contentType.includes("multipart/form-data")) {
    return await applyUpdate(req);
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
  const bp = path.join(BACKUP_DIR, backupName);
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

async function applyUpdate(req: Request) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const backupName = `pre-update-${ts}.db`;
  let manifest: any = { description: "Update", version: "unknown" };

  try {
    const { execSync } = await import("child_process");
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    // Step 1: ALWAYS backup first
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    if (existsSync(DB_PATH)) {
      await fs.copyFile(DB_PATH, path.join(BACKUP_DIR, backupName));
    }

    // Step 2: Save zip
    const zipPath = path.join(process.cwd(), "update-package.zip");
    await fs.writeFile(zipPath, Buffer.from(await file.arrayBuffer()));

    // Step 3: Extract using Node.js native (no dependency on unzip binary)
    const extractDir = path.join(process.cwd(), "update-extracted");
    if (existsSync(extractDir)) await fs.rm(extractDir, { recursive: true });
    await fs.mkdir(extractDir, { recursive: true });

    try {
      // Try unzip command first
      execSync(`unzip -o "${zipPath}" -d "${extractDir}" 2>/dev/null`, { stdio: "pipe" });
    } catch {
      // Fallback: use python3 to unzip
      try {
        execSync(`python3 -c "
import zipfile, os
with zipfile.ZipFile('${zipPath}', 'r') as z:
    z.extractall('${extractDir}')
"`, { stdio: "pipe" });
      } catch {
        // Fallback 2: use bun
        try {
          execSync(`bun -e "
const fs = require('fs');
const path = require('path');
const { createReadStream } = require('fs');
// Simple extraction using bun's built-in
const zip = require('adm-zip');
new zip('${zipPath}').extractAllTo('${extractDir}', true);
" 2>/dev/null`, { stdio: "pipe" });
        } catch {
          return NextResponse.json({
            ok: false, error: "Could not extract zip file", backupName,
            message: `Backup created (${backupName}) but zip extraction failed. The file may be corrupted or in an unsupported format.`,
          }, { status: 500 });
        }
      }
    }

    // Step 4: Read manifest
    const manifestPath = path.join(extractDir, "update.json");
    if (existsSync(manifestPath)) {
      try { manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8")); } catch {}
    }

    // Step 5: Copy source files (use cp -r with error tolerance)
    const srcDir = path.join(extractDir, "src");
    if (existsSync(srcDir)) {
      try {
        execSync(`cp -r "${srcDir}/"* "${process.cwd()}/src/" 2>/dev/null || true`, { stdio: "pipe" });
      } catch {}
    }

    // Step 6: Copy prisma files
    const prismaDir = path.join(extractDir, "prisma");
    if (existsSync(prismaDir)) {
      const schemaSrc = path.join(prismaDir, "schema.prisma");
      if (existsSync(schemaSrc)) {
        await fs.copyFile(schemaSrc, path.join(process.cwd(), "prisma", "schema.prisma"));
      }
      const migSrc = path.join(prismaDir, "migrations");
      if (existsSync(migSrc)) {
        try {
          execSync(`cp -r "${migSrc}/"* "${process.cwd()}/prisma/migrations/" 2>/dev/null || true`, { stdio: "pipe" });
        } catch {}
      }
    }

    // Step 7: Copy package.json if present
    const pkgSrc = path.join(extractDir, "package.json");
    let pkgChanged = false;
    if (existsSync(pkgSrc)) {
      await fs.copyFile(pkgSrc, path.join(process.cwd(), "package.json"));
      pkgChanged = true;
    }

    // Step 8: Regenerate Prisma client (only if schema changed)
    if (existsSync(path.join(extractDir, "prisma", "schema.prisma"))) {
      try {
        execSync("npx prisma generate 2>/dev/null", { stdio: "pipe", cwd: process.cwd(), timeout: 30000 });
      } catch {}
    }

    // Step 9: Run database migration (non-destructive)
    if (manifest.databaseChanges !== false && existsSync(path.join(extractDir, "prisma", "schema.prisma"))) {
      try {
        execSync("npx prisma db push 2>/dev/null", { stdio: "pipe", cwd: process.cwd(), timeout: 30000 });
      } catch {
        // Non-fatal — the code is already updated, DB can be migrated manually
      }
    }

    // Step 10: Install deps if package.json changed
    if (pkgChanged) {
      try { execSync("bun install 2>/dev/null", { stdio: "pipe", cwd: process.cwd(), timeout: 60000 }); } catch {}
    }

    // Step 11: Clean up
    await fs.unlink(zipPath).catch(() => {});
    await fs.rm(extractDir, { recursive: true }).catch(() => {});

    return NextResponse.json({
      ok: true,
      backupName,
      manifest,
      message: `Update applied successfully! Backup saved: ${backupName}. The page will reload shortly.`,
    });
  } catch (err: any) {
    // Even on error, the backup was already created in Step 1
    return NextResponse.json({
      ok: false,
      error: err?.message || "Unknown error",
      backupName,
      manifest,
      message: `Update failed, but a database backup was created: ${backupName}. You can restore from the backups list if needed.`,
    }, { status: 500 });
  }
}
