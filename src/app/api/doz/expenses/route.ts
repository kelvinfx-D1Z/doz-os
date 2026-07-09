import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// =====================================================
// Receipt Upload API — Phase 2 (P2-D)
// GET  /api/doz/expenses          → list expenses + receipt stats
// POST /api/doz/expenses          → upload receipt (multipart/form-data)
//      fields: file (File), expenseId (string)
//      → saves to /home/z/my-project/public/upload/receipt-<id>-<ts>.<ext>
//      → marks expense.isVerified = true, expense.receiptUrl = "/upload/<filename>"
// =====================================================

const UPLOAD_DIR = path.join(process.cwd(), "public", "upload");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Allowed MIME types: images + PDF
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
  "application/pdf",
]);

// Map MIME → extension (fallback for browsers that report generic octet-stream)
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "application/pdf": "pdf",
};

function safeFilenamePart(s: string): string {
  // strip any path separators / weird chars; keep alphanumerics + dash
  return s.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
}

// ---------- GET ----------
export async function GET() {
  try {
    const expenses = await db.expense.findMany({
      include: {
        project: { select: { name: true } },
        vendor: { select: { name: true } },
      },
      orderBy: { expenseDate: "desc" },
    });

    const out = expenses.map((e) => ({
      id: e.id,
      category: e.category,
      description: e.description,
      amount: e.amount,
      expenseDate: e.expenseDate,
      isVerified: e.isVerified,
      receiptUrl: e.receiptUrl,
      project: { name: e.project?.name ?? "—" },
      vendor: { name: e.vendor?.name ?? "—" },
    }));

    const stats = {
      total: out.length,
      verified: out.filter((e) => e.isVerified).length,
      unverified: out.filter((e) => !e.isVerified).length,
      withReceipt: out.filter((e) => !!e.receiptUrl).length,
    };

    return NextResponse.json({ expenses: out, stats });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/doz/expenses] error:", message);
    return NextResponse.json(
      { error: "Failed to fetch expenses", message },
      { status: 500 }
    );
  }
}

// ---------- POST (multipart/form-data) ----------
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const expenseIdRaw = formData.get("expenseId");

    // ---- Validate required fields ----
    if (!expenseIdRaw) {
      return NextResponse.json(
        { error: "Missing required field: expenseId" },
        { status: 400 }
      );
    }
    const expenseId = String(expenseIdRaw);

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing required field: file (must be a File)" },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "Uploaded file is empty" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File too large. Max ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)}MB, got ${(file.size / 1024 / 1024).toFixed(2)}MB`,
        },
        { status: 400 }
      );
    }

    // ---- Validate MIME type ----
    // Allow if explicit type is in allowlist, OR if name extension is recognizable.
    const name = file.name.toLowerCase();
    const extFromName = name.includes(".") ? name.split(".").pop()! : "";
    let ext = EXT_BY_TYPE[file.type] ?? "";
    if (!ext && extFromName) {
      // recover extension from filename for browsers reporting generic types
      if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "pdf"].includes(extFromName)) {
        ext = extFromName === "jpeg" ? "jpg" : extFromName;
      }
    }

    const typeOk = ALLOWED_TYPES.has(file.type) || !!ext;
    if (!typeOk) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type || "unknown"}. Only images (image/*) or PDF (application/pdf) are allowed.`,
        },
        { status: 400 }
      );
    }

    // ---- Verify the expense exists ----
    const expense = await db.expense.findUnique({
      where: { id: expenseId },
      include: { project: { select: { name: true } }, vendor: { select: { name: true } } },
    });
    if (!expense) {
      return NextResponse.json(
        { error: `Expense not found for id=${expenseId}` },
        { status: 404 }
      );
    }

    // ---- Ensure upload directory exists ----
    if (!existsSync(UPLOAD_DIR)) {
      await mkdir(UPLOAD_DIR, { recursive: true });
    }

    // ---- Save the file ----
    const safeId = safeFilenamePart(expenseId) || "expense";
    const filename = `receipt-${safeId}-${Date.now()}.${ext}`;
    const fullPath = path.join(UPLOAD_DIR, filename);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(fullPath, buffer);

    // ---- Update Expense: link receipt + mark verified ----
    const receiptUrl = `/upload/${filename}`;
    const updated = await db.expense.update({
      where: { id: expenseId },
      data: {
        receiptUrl,
        isVerified: true,
      },
      include: { project: { select: { name: true } }, vendor: { select: { name: true } } },
    });

    const expenseOut = {
      id: updated.id,
      category: updated.category,
      description: updated.description,
      amount: updated.amount,
      expenseDate: updated.expenseDate,
      isVerified: updated.isVerified,
      receiptUrl: updated.receiptUrl,
      project: { name: updated.project?.name ?? "—" },
      vendor: { name: updated.vendor?.name ?? "—" },
    };

    return NextResponse.json({
      success: true,
      expense: expenseOut,
      receiptUrl,
      filename,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /api/doz/expenses] error:", message);
    return NextResponse.json(
      { error: "Failed to upload receipt", message },
      { status: 500 }
    );
  }
}
