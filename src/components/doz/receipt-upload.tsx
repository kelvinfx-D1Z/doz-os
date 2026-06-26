"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  CheckCircle2,
  Loader2,
  Eye,
  RefreshCw,
} from "lucide-react";

// =====================================================
// ReceiptUpload — per-row receipt upload control
// Phase 2 (P2-D)
// =====================================================
// Props:
//   expenseId          — the Expense.id this receipt belongs to
//   currentReceiptUrl  — existing receipt URL (or null/undefined)
//   isVerified         — whether the expense is already verified
//   onUploaded?        — callback when upload succeeds (parent refetches)
//
// Behavior:
//   • If receipt exists: show "View" link (opens in new tab) + emerald verified checkmark + "Replace" button
//   • If no receipt:    show "Upload" button (Upload icon)
//   • On file select: POST multipart to /api/doz/expenses, loading spinner, toast, onUploaded()
// =====================================================

interface ReceiptUploadProps {
  expenseId: string;
  currentReceiptUrl?: string | null;
  isVerified: boolean;
  onUploaded?: () => void;
}

export function ReceiptUpload({
  expenseId,
  currentReceiptUrl,
  isVerified,
  onUploaded,
}: ReceiptUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasReceipt = !!currentReceiptUrl;

  const openPicker = () => {
    inputRef.current?.click();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;

    // Client-side guards (server also validates)
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/bmp",
      "image/tiff",
      "application/pdf",
    ];
    const name = file.name.toLowerCase();
    const ext = name.includes(".") ? name.split(".").pop()! : "";
    const extOk = [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "bmp",
      "tiff",
      "pdf",
    ].includes(ext);

    if (!allowedTypes.includes(file.type) && !extOk) {
      toast.error("Unsupported file type", {
        description: "Only images (JPG, PNG, etc.) or PDF are allowed.",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large", {
        description: "Maximum size is 10MB.",
      });
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("expenseId", expenseId);

      const res = await fetch("/api/doz/expenses", {
        method: "POST",
        body: fd,
      });

      const data = await res.json();

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Upload failed (HTTP ${res.status})`);
      }

      toast.success("Receipt uploaded", {
        description: "Expense marked as verified.",
      });
      onUploaded?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error("Receipt upload failed", { description: message });
    } finally {
      setUploading(false);
      // reset input so the same file can be re-selected later
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    void handleFile(file);
  };

  return (
    <div className="flex items-center justify-center gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={handleChange}
        className="sr-only"
        aria-label={`Upload receipt for expense ${expenseId}`}
        tabIndex={-1}
      />

      {uploading ? (
        <Button
          size="sm"
          variant="outline"
          disabled
          className="gap-1"
          aria-label="Uploading receipt"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-[11px]">Saving…</span>
        </Button>
      ) : hasReceipt ? (
        <div className="flex items-center gap-1.5">
          <a
            href={currentReceiptUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline"
            title="View receipt"
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </a>
          {isVerified && (
            <CheckCircle2
              className="h-3.5 w-3.5 text-emerald-500"
              aria-label="Verified"
            />
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={openPicker}
            className="gap-1 px-2"
            title="Replace receipt"
            aria-label="Replace receipt"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="sr-only sm:not-sr-only sm:text-[11px]">Replace</span>
          </Button>
        </div>
      ) : isVerified ? (
        // Verified but no receipt file — still allow upload
        <div className="flex items-center gap-1.5">
          <CheckCircle2
            className="h-3.5 w-3.5 text-emerald-500"
            aria-label="Verified"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={openPicker}
            className="gap-1"
            title="Upload receipt"
          >
            <Upload className="h-3.5 w-3.5" />
            <span className="text-[11px]">Upload</span>
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          onClick={openPicker}
          className="gap-1"
          title="Upload receipt"
        >
          <Upload className="h-3.5 w-3.5" />
          <span className="text-[11px]">Upload</span>
        </Button>
      )}
    </div>
  );
}

// Re-export icon for convenience in parent tables that want a header icon.
export { FileText };
