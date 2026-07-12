"use client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database, Download, RotateCcw, Trash2, Shield,
  CheckCircle2, AlertTriangle, Loader2, Package, Info,
} from "lucide-react";
import { SectionHeader, StatCard } from "@/components/doz/ui-primitives";
import { formatDate, relativeTime } from "@/lib/format";
import { toast } from "sonner";

interface Backup {
  name: string;
  size: number;
  date: string;
}

interface UpdateData {
  backups: Backup[];
  dbInfo: {
    size: number;
    sizeFormatted: string;
    recordCounts: { users: number; projects: number; vendors: number; opportunities: number; invoices: number; tasks: number };
    totalRecords: number;
  };
  version: string;
}

export function UpdatesPage() {
  const [data, setData] = useState<UpdateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/doz/updates");
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch { toast.error("Couldn't load system info"); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function createBackup() {
    setBacking(true);
    try {
      const res = await fetch("/api/doz/updates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "backup" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success(d.message);
      load();
    } catch { toast.error("Backup failed"); }
    finally { setBacking(false); }
  }

  async function restore(name: string) {
    if (!confirm(`Restore database from ${name}? This will replace current data.`)) return;
    setRestoring(name);
    try {
      const res = await fetch("/api/doz/updates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", backupName: name }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      toast.success(d.message);
      load();
    } catch { toast.error("Restore failed"); }
    finally { setRestoring(null); }
  }

  async function deleteBackup(name: string) {
    if (!confirm(`Delete backup ${name}?`)) return;
    try {
      await fetch("/api/doz/updates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_backup", backupName: name }),
      });
      toast.success("Backup deleted");
      load();
    } catch { toast.error("Failed"); }
  }

  if (loading || !data) {
    return <div className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={<Package className="h-5 w-5" />}
        title="System Updates & Backups"
        description={`DOZ OS ${data.version} — manage updates and protect your data`}
        action={
          <Button size="sm" onClick={createBackup} disabled={backing} className="gap-1.5 bg-primary text-primary-foreground">
            {backing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
            Create Backup
          </Button>
        }
      />

      {/* System Info */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Database Size" value={data.dbInfo.sizeFormatted} icon={<Database className="h-4 w-4" />} />
        <StatCard label="Total Records" value={data.dbInfo.totalRecords} icon={<Package className="h-4 w-4" />} />
        <StatCard label="Backups" value={data.backups.length} icon={<Shield className="h-4 w-4" />} />
        <StatCard label="Version" value={data.version} icon={<Info className="h-4 w-4" />} />
      </div>

      {/* Update deployment notice */}
      <Card className="border-l-4 border-l-amber-500/50 p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4 text-amber-400" /> Deploying Updates
        </div>
        <p className="text-xs text-muted-foreground">
          For security, in-app code updates are disabled. Deploy new versions of DOZ OS via your
          CI/CD pipeline or version control system (git push). This prevents arbitrary code execution
          via uploaded archives. Database backup and restore remain available below — use them before
          and after any deployment.
        </p>
        <div className="mt-3 rounded-lg bg-muted/30 p-3 text-[11px] text-muted-foreground">
          <p className="font-semibold text-foreground mb-1">Recommended deploy flow:</p>
          <ol className="ml-4 list-decimal space-y-0.5">
            <li>Click "Create Backup" below to snapshot your current database</li>
            <li>Deploy the new code via your hosting platform (Vercel, Docker, etc.)</li>
            <li>If something breaks, use "Restore" on the backup you just created</li>
          </ol>
        </div>
      </Card>

      {/* Backups */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4 text-primary" /> Database Backups
          </div>
          <Badge variant="outline" className="text-[10px]">{data.backups.length} backups</Badge>
        </div>

        {data.backups.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-6">
            No backups yet. Click "Create Backup" to save your current database.
          </p>
        ) : (
          <div className="scroll-thin max-h-80 space-y-2 overflow-y-auto">
            {data.backups.map((b) => (
              <div key={b.name} className="flex items-center justify-between rounded-lg border border-border p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-mono font-medium">{b.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {(b.size / 1024).toFixed(0)} KB · {formatDate(b.date)} · {relativeTime(b.date)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => restore(b.name)} disabled={restoring === b.name}>
                    {restoring === b.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    Restore
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 text-rose-400" onClick={() => deleteBackup(b.name)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Record counts */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Database className="h-4 w-4 text-primary" /> Current Database Contents
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {Object.entries(data.dbInfo.recordCounts).map(([key, value]) => (
            <div key={key} className="rounded-lg bg-muted/30 p-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{key}</p>
              <p className="text-sm font-bold">{value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* How updates work */}
      <Card className="border-l-4 border-l-amber-500/50 p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Info className="h-4 w-4 text-amber-400" /> How Updates Work
        </div>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <p><strong className="text-foreground">1. Create backup</strong> — Always create a backup before applying any update. The system also auto-creates one before every update.</p>
          <p><strong className="text-foreground">2. Upload zip</strong> — The zip should contain updated <code className="font-mono text-[10px]">src/</code> files, <code className="font-mono text-[10px]">prisma/schema.prisma</code>, and optionally <code className="font-mono text-[10px]">prisma/migrations/</code>.</p>
          <p><strong className="text-foreground">3. Auto-backup</strong> — System copies your database to <code className="font-mono text-[10px]">db/backups/</code> before touching anything.</p>
          <p><strong className="text-foreground">4. Apply code</strong> — New source files replace old ones. Prisma client is regenerated.</p>
          <p><strong className="text-foreground">5. Migrate database</strong> — Schema changes are applied incrementally (ALTER TABLE, not DROP TABLE). Your data is preserved.</p>
          <p><strong className="text-foreground">6. If something breaks</strong> — Use the Restore button to roll back to any backup. Your data is never lost.</p>
        </div>
      </Card>
    </div>
  );
}
