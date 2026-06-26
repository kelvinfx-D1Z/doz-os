"use client";

import { useState } from "react";
import {
  X,
  Plus,
  Building2,
  User,
  Phone,
  Mail,
  Star,
  Banknote,
  StickyNote,
  CheckCircle2,
  Truck,
  Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ============================================================
// AddVendorForm — INTERNAL form for Production Manager / staff
// to add a vendor directly to the database.
// Vendors do NOT have login accounts. Staff input everything.
// ============================================================

const CATEGORIES: { value: string; label: string }[] = [
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "CATERING", label: "Catering" },
  { value: "DECOR", label: "Decor" },
  { value: "PRINTING", label: "Printing" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "SOUND", label: "Sound" },
  { value: "LIGHTING", label: "Lighting" },
  { value: "LED_SCREEN", label: "LED Screen" },
  { value: "STAGE", label: "Stage" },
  { value: "OTHER", label: "Other" },
];

interface FormState {
  name: string;
  category: string;
  contactName: string;
  phone: string;
  email: string;
  bankAccount: string;
  rating: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  category: "",
  contactName: "",
  phone: "",
  email: "",
  bankAccount: "",
  rating: "0",
  notes: "",
};

export function AddVendorForm({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Vendor name is required";
    if (!form.category) return "Please select a category";
    if (!form.contactName.trim()) return "Contact name is required";
    if (!form.phone.trim()) return "Phone number is required";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/doz/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_vendor",
          name: form.name.trim(),
          category: form.category,
          contactName: form.contactName.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          bankAccount: form.bankAccount.trim() || undefined,
          rating: parseInt(form.rating) || 0,
          notes: form.notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to add vendor");
        return;
      }

      toast.success("Vendor added", {
        description: `${form.name} is now in the vendor database.`,
      });
      setSuccess(true);
      onSaved?.();
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setForm(EMPTY_FORM);
    setSuccess(false);
  }

  // ---------- Success state ----------
  if (success) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
        <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 py-12">
          <Card className="w-full border-primary/30 bg-primary/[0.04] p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight">
              Vendor added successfully
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{form.name}</span> has been
              added to the vendor database. You can now issue RFQs and purchase orders
              to this vendor.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button
                onClick={handleReset}
                variant="outline"
                className="w-full sm:w-auto"
              >
                <Plus className="mr-1 h-4 w-4" /> Add another
              </Button>
              <Button
                onClick={onClose}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
              >
                Done
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ---------- Form state ----------
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-mono text-sm font-bold text-primary-foreground">
              10
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                Add New Vendor
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                Internal — Procurement team only
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 shrink-0"
            aria-label="Close form"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Body */}
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Intro */}
        <div className="mb-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
            <Truck className="h-3.5 w-3.5" />
            Vendor Database
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Add a vendor
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Enter the vendor's details below to add them directly to the database.
            Once added, you can issue RFQs, compare quotes, and create purchase orders
            for this vendor.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Company section */}
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-primary" />
              Vendor Information
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">
                  Vendor / Company Name <span className="text-rose-400">*</span>
                </Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="e.g. Crystal Visuals NG"
                  required
                  maxLength={120}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="category" className="text-xs">
                    Category <span className="text-rose-400">*</span>
                  </Label>
                  <Select
                    value={form.category}
                    onValueChange={(v) => update("category", v)}
                  >
                    <SelectTrigger id="category" className="w-full">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rating" className="text-xs">
                    Initial Rating
                  </Label>
                  <Select
                    value={form.rating}
                    onValueChange={(v) => update("rating", v)}
                  >
                    <SelectTrigger id="rating" className="w-full">
                      <SelectValue placeholder="Rate this vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Not rated yet</SelectItem>
                      <SelectItem value="1">1 — Poor</SelectItem>
                      <SelectItem value="2">2 — Fair</SelectItem>
                      <SelectItem value="3">3 — Good</SelectItem>
                      <SelectItem value="4">4 — Very Good</SelectItem>
                      <SelectItem value="5">5 — Excellent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </Card>

          {/* Contact section */}
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <User className="h-4 w-4 text-primary" />
              Contact Person
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="contactName" className="text-xs">
                  Contact Name <span className="text-rose-400">*</span>
                </Label>
                <Input
                  id="contactName"
                  value={form.contactName}
                  onChange={(e) => update("contactName", e.target.value)}
                  placeholder="Full name"
                  required
                  maxLength={80}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs">
                  Phone <span className="text-rose-400">*</span>
                </Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => update("phone", e.target.value)}
                    placeholder="+234 807 000 0000"
                    required
                    className="pl-8"
                    maxLength={30}
                  />
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="email" className="text-xs">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                    placeholder="contact@company.com"
                    className="pl-8"
                    maxLength={120}
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Banking section */}
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Banknote className="h-4 w-4 text-primary" />
              Bank Details
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bankAccount" className="text-xs">
                Bank Account (Bank — Number)
              </Label>
              <Input
                id="bankAccount"
                value={form.bankAccount}
                onChange={(e) => update("bankAccount", e.target.value)}
                placeholder="e.g. GTBank — 0123456789"
                maxLength={80}
              />
              <p className="text-[10px] text-muted-foreground">
                Used for payment processing when issuing purchase orders.
              </p>
            </div>
          </Card>

          {/* Notes */}
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <StickyNote className="h-4 w-4 text-primary" />
              Notes / Capabilities
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs">
                What can this vendor supply? Specialisations, capacity, lead times…
              </Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="e.g. Specializes in 4K cinema cameras + stabilizers. Can supply 2x FX6 + 1x Ronin. 24h notice for equipment rental."
                rows={4}
                maxLength={1500}
              />
            </div>
          </Card>

          {/* Submit */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-muted-foreground">
              Fields marked <span className="text-rose-400">*</span> are required.
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={submitting}
                className="h-10"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className={cn(
                  "h-10 gap-2 bg-primary text-primary-foreground hover:bg-primary/90",
                  submitting && "opacity-70"
                )}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add Vendor
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
