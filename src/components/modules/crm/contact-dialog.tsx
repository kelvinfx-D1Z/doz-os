"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ContactDialog({
  accountId,
  accountName,
  open,
  onOpenChange,
  onSaved,
}: {
  accountId: string | null;
  accountName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/doz/crm/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_contact",
          accountId,
          name: name.trim(),
          title: title.trim() || undefined,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
      toast.success(`${name.trim()} added to ${accountName}`);
      setName(""); setTitle(""); setEmail(""); setPhone("");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error("Couldn't add contact", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Add a contact at {accountName}</DialogTitle>
          <DialogDescription>
            Knowing a second person here protects the account if your main contact moves on.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Name *</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-title">Role</Label>
            <Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Head of Communications" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Phone</Label>
              <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving || !name.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Add contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
