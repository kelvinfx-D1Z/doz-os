"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SectionHeader, EmptyState, StatCard } from "@/components/doz/ui-primitives";
import { useCurrentUser } from "@/hooks/use-current-user";
import { formatNGN } from "@/lib/format";
import { Truck, Plus, Loader2, Clock, CheckCircle2, XCircle, Package } from "lucide-react";
import { toast } from "sonner";

// Vendors — the operational half of procurement, safe to delegate.
// Deliberately excludes payment requests, approvals, POs and RFQs: those move
// money and stay in the founder-only Procurement module.

const CATEGORIES = ["EQUIPMENT","CATERING","DECOR","PRINTING","TRANSPORT","SOUND","LIGHTING","LED","STAGE","OTHER"];

// What a vendor in each category typically supplies on an event or shoot.
// Drives the "what they're providing" dropdown so entries stay consistent —
// free-typing produced "LED wall", "led screen" and "LED Wall" as three
// different things, which makes cost comparison across projects impossible.
// "Other…" always available as an escape hatch.
const SERVICES_BY_CATEGORY: Record<string, string[]> = {
  EQUIPMENT: ["Camera package", "Lens kit", "Gimbal / stabiliser", "Drone", "Generator", "Power distribution", "Rigging", "Cabling"],
  SOUND: ["PA system", "Microphones", "Audio mixer", "Sound engineer", "In-ear monitors", "Recording"],
  LIGHTING: ["Stage lighting", "Uplighting", "Follow spot", "Lighting console", "Lighting operator", "Practical lighting"],
  LED: ["LED wall", "LED screen", "Video wall", "Screen processor", "LED operator"],
  STAGE: ["Stage construction", "Truss", "Backdrop", "Podium / lectern", "Platform / riser", "Carpeting"],
  CATERING: ["Full catering", "Refreshments", "Packaged meals", "Water", "Service staff"],
  DECOR: ["Event decor", "Floral arrangement", "Draping", "Furniture rental", "Signage"],
  PRINTING: ["Banners", "Backdrop printing", "Roll-up stands", "Brochures", "Name tags", "Certificates"],
  TRANSPORT: ["Vehicle hire", "Equipment haulage", "Crew transport", "Logistics coordination"],
  OTHER: [],
};

const GENERAL_SERVICES = [
  "Venue", "Security", "Photography", "Videography", "Livestream", "Internet / connectivity",
  "Ushers / protocol", "Cleaning", "Permits", "Accommodation",
];

const OTHER_OPTION = "__other__";

function servicesFor(category?: string): string[] {
  const specific = category ? SERVICES_BY_CATEGORY[category] ?? [] : [];
  // De-duplicate while keeping the category-specific options first.
  return Array.from(new Set([...specific, ...GENERAL_SERVICES]));
}

interface Vendor { id: string; name: string; category: string; contactName?: string | null; phone?: string | null; email?: string | null; rating?: number; isActive?: boolean }
interface Project { id: string; name: string; code: string | null; status: string }
interface Cost {
  id: string; projectId: string; vendorName: string; item: string;
  fee: number; amountPaid: number; balance: number; status: string;
  approvalStatus: string; submittedById: string | null;
}

export function Vendors() {
  const { user } = useCurrentUser();
  const isFounder = user?.role === "FOUNDER";
  const myId = user?.id;

  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [addVendorOpen, setAddVendorOpen] = useState(false);
  const [addCostOpen, setAddCostOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadVendors = useCallback(async () => {
    const r = await fetch("/api/doz/vendors");
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
    setVendors(j.vendors ?? []);
  }, []);

  const loadCosts = useCallback(async (projectId: string) => {
    if (!projectId) { setCosts([]); return; }
    const r = await fetch(`/api/doz/project-vendors?projectId=${encodeURIComponent(projectId)}`);
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
    setCosts(j.vendorCosts ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/doz/vendors").then((r) => r.json()),
      fetch("/api/doz/projects").then((r) => r.json()),
    ])
      .then(([v, p]) => {
        if (cancelled) return;
        setVendors(v.vendors ?? []);
        const list: Project[] = (p.projects ?? []).map((x: any) => ({ id: x.id, name: x.name, code: x.code, status: x.status }));
        setProjects(list);
        if (list.length) {
          setSelectedProject(list[0].id);
          loadCosts(list[0].id).catch(() => {});
        }
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); });
    return () => { cancelled = true; };
  }, [loadCosts]);

  async function decide(costId: string, action: "approve" | "reject") {
    setBusyId(costId);
    try {
      const r = await fetch("/api/doz/project-vendors", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costId, action }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      toast.success(action === "approve" ? "Vendor cost approved" : "Vendor cost rejected");
      await loadCosts(selectedProject);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed", { duration: 8000 });
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <Card className="p-6"><p className="text-sm text-destructive">{error}</p></Card>;
  if (!vendors) return <div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" /></div>;

  const pending = costs.filter((c) => c.approvalStatus === "PENDING");
  const totalFee = costs.filter((c) => c.approvalStatus === "APPROVED").reduce((s, c) => s + c.fee, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Vendors" value={vendors.length} icon={<Truck className="h-4 w-4" />} />
        <StatCard label="Awaiting approval" value={pending.length} icon={<Clock className="h-4 w-4" />} accent={pending.length ? "warning" : "default"} />
        {isFounder && (
          <StatCard label="Approved cost on this project" value={formatNGN(totalFee, true)} icon={<Package className="h-4 w-4" />} />
        )}
      </div>

      <Tabs defaultValue="costs">
        <TabsList>
          <TabsTrigger value="costs">Project vendors</TabsTrigger>
          <TabsTrigger value="directory">Directory</TabsTrigger>
        </TabsList>

        {/* ---------- PROJECT VENDOR COSTS ---------- */}
        <TabsContent value="costs">
          <Card className="p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-[220px] flex-1 space-y-1.5">
                <Label htmlFor="v-project">Project</Label>
                <Select
                  value={selectedProject}
                  onValueChange={(v) => { setSelectedProject(v); loadCosts(v).catch(() => {}); }}
                >
                  <SelectTrigger id="v-project"><SelectValue placeholder="Choose a project" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="gap-1.5" disabled={!selectedProject} onClick={() => setAddCostOpen(true)}>
                <Plus className="h-4 w-4" /> Add vendor to project
              </Button>
            </div>

            <div className="mt-4">
              {costs.length === 0 ? (
                <EmptyState icon={<Truck className="h-8 w-8" />} title="No vendors on this project" hint="Add one to start tracking what they're owed." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Fee</TableHead>
                      <TableHead>Approval</TableHead>
                      {isFounder && <TableHead className="text-right">Action</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costs.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.vendorName}</TableCell>
                        <TableCell className="text-muted-foreground">{c.item}</TableCell>
                        <TableCell className="text-right">
                          {isFounder || c.submittedById === myId ? (
                            formatNGN(c.fee)
                          ) : (
                            <span className="text-muted-foreground/50">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {c.approvalStatus === "PENDING" ? (
                            <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-400">
                              <Clock className="h-3 w-3" /> Awaiting approval
                            </Badge>
                          ) : c.approvalStatus === "REJECTED" ? (
                            <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                              <XCircle className="h-3 w-3" /> Rejected
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> Approved
                            </Badge>
                          )}
                        </TableCell>
                        {isFounder && (
                          <TableCell className="text-right">
                            {c.approvalStatus === "PENDING" && (
                              <div className="flex justify-end gap-1.5">
                                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busyId === c.id} onClick={() => decide(c.id, "approve")}>Approve</Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" disabled={busyId === c.id} onClick={() => decide(c.id, "reject")}>Reject</Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* ---------- DIRECTORY ---------- */}
        <TabsContent value="directory">
          <Card className="p-5">
            <div className="flex items-start justify-between gap-3">
              <SectionHeader icon={<Truck className="h-4 w-4" />} title="Vendor directory" description={`${vendors.length} vendors`} />
              <Button className="shrink-0 gap-1.5" onClick={() => setAddVendorOpen(true)}>
                <Plus className="h-4 w-4" /> Add vendor
              </Button>
            </div>
            <div className="mt-4">
              {vendors.length === 0 ? (
                <EmptyState icon={<Truck className="h-8 w-8" />} title="No vendors yet" hint="Add the suppliers you work with." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Phone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vendors.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{v.name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{v.category}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{v.contactName || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{v.phone || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <AddVendorDialog open={addVendorOpen} onOpenChange={setAddVendorOpen} isFounder={!!isFounder} onSaved={() => loadVendors().catch(() => {})} />
      <AddCostDialog
        open={addCostOpen}
        onOpenChange={setAddCostOpen}
        projectId={selectedProject}
        vendors={vendors}
        isFounder={!!isFounder}
        onSaved={() => loadCosts(selectedProject).catch(() => {})}
      />
    </div>
  );
}

function AddVendorDialog({ open, onOpenChange, onSaved, isFounder }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void; isFounder: boolean }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("EQUIPMENT");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/doz/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_vendor", name: name.trim(), category, contactName: contactName.trim(), phone: phone.trim() }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      toast.success(j?.pendingApproval ? `${name.trim()} sent to the founder for approval` : `${name.trim()} added`);
      setName(""); setContactName(""); setPhone("");
      onOpenChange(false); onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add vendor", { duration: 8000 });
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Add a vendor</DialogTitle>
          <DialogDescription>
            A supplier you hire — sound, LED, catering, transport and so on.
            {!isFounder && " This goes to the founder for approval before it joins the directory."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nv-name">Vendor name *</Label>
            <Input id="nv-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nv-cat">Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="nv-cat"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nv-contact">Contact name</Label>
              <Input id="nv-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nv-phone">Phone</Label>
              <Input id="nv-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {isFounder ? "Add vendor" : "Submit for approval"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddCostDialog({
  open, onOpenChange, projectId, vendors, isFounder, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; projectId: string;
  vendors: Vendor[]; isFounder: boolean; onSaved: () => void;
}) {
  const [vendorId, setVendorId] = useState("");
  const [service, setService] = useState("");      // dropdown selection
  const [customItem, setCustomItem] = useState(""); // used when "Other…" chosen
  const [fee, setFee] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedVendor = vendors.find((v) => v.id === vendorId);
  const options = servicesFor(selectedVendor?.category);
  const item = service === OTHER_OPTION ? customItem : service;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !item.trim() || saving) return;
    setSaving(true);
    try {
      const r = await fetch("/api/doz/project-vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          vendorId: vendorId || undefined,
          vendorName: vendors.find((v) => v.id === vendorId)?.name,
          item: item.trim(),
          fee: Number(fee) || 0,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || `Failed (${r.status})`);
      toast.success(
        j?.pendingApproval ? "Sent to the founder for approval" : "Vendor added to project",
      );
      setService(""); setCustomItem(""); setFee(""); setVendorId("");
      onOpenChange(false); onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add", { duration: 8000 });
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Add vendor to project</DialogTitle>
          <DialogDescription>
            {isFounder
              ? "This is applied immediately."
              : "This goes to the founder for approval before it counts."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nc-vendor">Vendor</Label>
            <Select
              value={vendorId}
              onValueChange={(v) => {
                setVendorId(v);
                // The service list is category-driven, so a previous pick may
                // no longer be offered — clear it rather than submit something
                // that isn't in the new list.
                setService("");
                setCustomItem("");
              }}
            >
              <SelectTrigger id="nc-vendor"><SelectValue placeholder="Choose a vendor" /></SelectTrigger>
              <SelectContent>{vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nc-item">What they&apos;re providing *</Label>
            <Select value={service} onValueChange={setService}>
              <SelectTrigger id="nc-item">
                <SelectValue placeholder={selectedVendor ? `Common for ${selectedVendor.category}…` : "Choose a service…"} />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                <SelectItem value={OTHER_OPTION} className="font-medium text-primary">Other…</SelectItem>
              </SelectContent>
            </Select>
            {service === OTHER_OPTION && (
              <Input
                autoFocus
                value={customItem}
                onChange={(e) => setCustomItem(e.target.value)}
                placeholder="Describe what they're providing"
              />
            )}
            {selectedVendor && (
              <p className="text-[11px] text-muted-foreground">
                Showing services common for {selectedVendor.category.toLowerCase()} vendors first.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nc-fee">Fee (NGN)</Label>
            <Input id="nc-fee" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !item.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {isFounder ? "Add" : "Submit for approval"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
