"use client";

import { useState } from "react";
import {
  X,
  Send,
  Building2,
  User,
  Phone,
  Mail,
  FileText,
  Banknote,
  Users,
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
// VendorApply — public full-screen vendor application form
// Renders as a fixed overlay; parent controls open/close via `onClose`
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
  companyName: string;
  category: string;
  contactName: string;
  phone: string;
  email: string;
  cacNumber: string;
  bankName: string;
  bankAccount: string;
  references: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  companyName: "",
  category: "",
  contactName: "",
  phone: "",
  email: "",
  cacNumber: "",
  bankName: "",
  bankAccount: "",
  references: "",
  notes: "",
};

export function VendorApply({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    if (!form.companyName.trim()) return "Company name is required";
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
          companyName: form.companyName.trim(),
          category: form.category,
          contactName: form.contactName.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          cacNumber: form.cacNumber.trim() || undefined,
          bankName: form.bankName.trim() || undefined,
          bankAccount: form.bankAccount.trim() || undefined,
          references: form.references.trim() || undefined,
          notes: form.notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to submit application");
        return;
      }

      toast.success("Application submitted", {
        description: "Our procurement team will review and respond within 48 hours.",
      });
      setSuccess(true);
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
              Application received!
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Thank you for your interest in joining the Digit One Zero vendor
              network. Our team will review your application and respond within{" "}
              <span className="font-semibold text-foreground">48 hours</span>.
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
              <Send className="h-3.5 w-3.5" />
              Reference: {form.companyName || "Application"}
            </div>
            <div className="mt-7 flex flex-col items-center justify-center gap-2 sm:flex-row">
              <Button
                onClick={handleReset}
                variant="outline"
                className="w-full sm:w-auto"
              >
                Submit another
              </Button>
              <Button
                onClick={onClose}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
              >
                Close
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
                Vendor Partnership Application
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                Digit One Zero Ltd
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 shrink-0"
            aria-label="Close application form"
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
            Vendor Network
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Join our vendor network
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            We partner with trusted suppliers across events, AV, staging, and
            production. Fill in the form below and our procurement team will
            review and respond within 48 hours.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Company section */}
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-primary" />
              Company Information
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName" className="text-xs">
                  Company Name <span className="text-rose-400">*</span>
                </Label>
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={(e) => update("companyName", e.target.value)}
                  placeholder="e.g. Crystal Visuals NG"
                  required
                  maxLength={120}
                />
              </div>

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
                <Label htmlFor="cacNumber" className="text-xs">
                  CAC Registration Number
                </Label>
                <Input
                  id="cacNumber"
                  value={form.cacNumber}
                  onChange={(e) => update("cacNumber", e.target.value)}
                  placeholder="e.g. RC-1234567 or BN-9876543"
                  maxLength={40}
                />
                <p className="text-[10px] text-muted-foreground">
                  Corporate Affairs Commission registration (optional but
                  preferred).
                </p>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bankName" className="text-xs">
                  Bank Name
                </Label>
                <Input
                  id="bankName"
                  value={form.bankName}
                  onChange={(e) => update("bankName", e.target.value)}
                  placeholder="e.g. GTBank"
                  maxLength={60}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bankAccount" className="text-xs">
                  Bank Account Number
                </Label>
                <Input
                  id="bankAccount"
                  value={form.bankAccount}
                  onChange={(e) => update("bankAccount", e.target.value)}
                  placeholder="10-digit NUBAN"
                  maxLength={20}
                />
              </div>
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">
              Used only for payment processing once your application is approved.
            </p>
          </Card>

          {/* References + Notes */}
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4 text-primary" />
              References &amp; Capabilities
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="references" className="text-xs">
                  Past Clients / References
                </Label>
                <Textarea
                  id="references"
                  value={form.references}
                  onChange={(e) => update("references", e.target.value)}
                  placeholder={"One per line, e.g.\nStandard Chartered Gala 2024\nLagos Fashion Week 2024"}
                  rows={4}
                  maxLength={1000}
                />
                <p className="text-[10px] text-muted-foreground">
                  One reference per line.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes" className="text-xs">
                  Notes / Capabilities
                </Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="What can you supply? Any specialisations, equipment, capacity, lead times…"
                  rows={4}
                  maxLength={1500}
                />
              </div>
            </div>
          </Card>

          {/* Submit */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] text-muted-foreground">
              <FileText className="mr-1 inline h-3 w-3" />
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
                    Submitting…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Application
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Footer note */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-[11px] text-muted-foreground">
            <StickyNote className="h-3.5 w-3.5 shrink-0" />
            <span>
              By submitting, you confirm the information provided is accurate.
              Digit One Zero Ltd will use this information solely for vendor
              onboarding and procurement decisions.
            </span>
          </div>
        </form>
      </main>
    </div>
  );
}
