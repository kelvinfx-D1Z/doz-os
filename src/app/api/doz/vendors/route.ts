import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ============================================================
// VENDOR ONBOARDING API (Phase 2)
//   GET    /api/doz/vendors       -> list applications + vendors + stats
//   POST   /api/doz/vendors       -> submit a new vendor application (public)
//   PATCH  /api/doz/vendors       -> staff approve / reject an application
// ============================================================

const VALID_CATEGORIES = [
  "EQUIPMENT",
  "CATERING",
  "DECOR",
  "PRINTING",
  "TRANSPORT",
  "SOUND",
  "LIGHTING",
  "LED_SCREEN",
  "STAGE",
  "OTHER",
] as const;

type Category = (typeof VALID_CATEGORIES)[number];

function isValidCategory(c: string): c is Category {
  return (VALID_CATEGORIES as readonly string[]).includes(c);
}

// ------------------------------------------------------------
// GET — list applications, existing vendors, and stats
// ------------------------------------------------------------
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const [applications, vendors] = await Promise.all([
      db.vendorApplication.findMany({
        orderBy: { createdAt: "desc" },
      }),
      db.vendor.findMany({
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const stats = {
      pending: applications.filter((a) => a.status === "PENDING").length,
      approved: applications.filter((a) => a.status === "APPROVED").length,
      rejected: applications.filter((a) => a.status === "REJECTED").length,
      totalVendors: vendors.length,
    };

    return NextResponse.json({
      applications: applications.map((a) => ({
        id: a.id,
        companyName: a.companyName,
        category: a.category,
        contactName: a.contactName,
        phone: a.phone,
        email: a.email,
        cacNumber: a.cacNumber,
        bankName: a.bankName,
        bankAccount: a.bankAccount,
        references: a.references,
        notes: a.notes,
        status: a.status,
        vendorId: a.vendorId,
        createdAt: a.createdAt,
      })),
      vendors: vendors.map((v) => ({
        id: v.id,
        name: v.name,
        category: v.category,
        contactName: v.contactName,
        phone: v.phone,
        email: v.email,
        rating: v.rating,
        totalSpent: v.totalSpent,
        isActive: v.isActive,
        createdAt: v.createdAt,
      })),
      stats,
    });
  } catch (e) {
    console.error("[GET /api/doz/vendors]", e);
    return NextResponse.json(
      { error: "Failed to load vendor applications" },
      { status: 500 }
    );
  }
}

// ------------------------------------------------------------
// POST — two modes:
//   1) action: "create_vendor"  → staff directly add a Vendor (PM inputs everything)
//   2) (default)                → submit a vendor application (intake queue)
// ------------------------------------------------------------
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // ---- Mode 1: Direct vendor creation (staff / PM) ----
    if (body.action === "create_vendor") {
      const name = String(body.name ?? "").trim();
      const category = String(body.category ?? "").trim();
      const contactName = String(body.contactName ?? "").trim();
      const phone = body.phone ? String(body.phone).trim() : null;
      const email = body.email ? String(body.email).trim() : null;
      const bankAccount = body.bankAccount ? String(body.bankAccount).trim() : null;
      const rating = typeof body.rating === "number" ? body.rating : 0;
      const notes = body.notes ? String(body.notes).trim() : null;

      if (!name) {
        return NextResponse.json({ error: "Vendor name is required" }, { status: 400 });
      }
      if (!category || !isValidCategory(category)) {
        return NextResponse.json(
          { error: `Category is required and must be one of: ${VALID_CATEGORIES.join(", ")}` },
          { status: 400 }
        );
      }
      if (!contactName) {
        return NextResponse.json({ error: "Contact name is required" }, { status: 400 });
      }
      if (!phone) {
        return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
      }

      const created = await db.vendor.create({
        data: {
          name,
          category,
          contactName,
          phone,
          email,
          bankAccount,
          rating,
          notes,
          isActive: true,
        },
      });

      return NextResponse.json(
        {
          vendor: {
            id: created.id,
            name: created.name,
            category: created.category,
            contactName: created.contactName,
            phone: created.phone,
            email: created.email,
            bankAccount: created.bankAccount,
            rating: created.rating,
            totalSpent: created.totalSpent,
            isActive: created.isActive,
            createdAt: created.createdAt,
          },
        },
        { status: 201 }
      );
    }

    // ---- Mode 2: Application submission (intake queue) ----
    const companyName = String(body.companyName ?? "").trim();
    const category = String(body.category ?? "").trim();
    const contactName = String(body.contactName ?? "").trim();
    const phone = body.phone ? String(body.phone).trim() : null;
    const email = body.email ? String(body.email).trim() : null;
    const cacNumber = body.cacNumber ? String(body.cacNumber).trim() : null;
    const bankName = body.bankName ? String(body.bankName).trim() : null;
    const bankAccount = body.bankAccount ? String(body.bankAccount).trim() : null;
    const references = body.references ? String(body.references).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    // Required-field validation
    if (!companyName) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }
    if (!category || !isValidCategory(category)) {
      return NextResponse.json(
        { error: `Category is required and must be one of: ${VALID_CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!contactName) {
      return NextResponse.json({ error: "Contact name is required" }, { status: 400 });
    }
    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const created = await db.vendorApplication.create({
      data: {
        companyName,
        category,
        contactName,
        phone,
        email,
        cacNumber,
        bankName,
        bankAccount,
        references,
        notes,
        status: "PENDING",
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        companyName: created.companyName,
        category: created.category,
        contactName: created.contactName,
        phone: created.phone,
        email: created.email,
        cacNumber: created.cacNumber,
        bankName: created.bankName,
        bankAccount: created.bankAccount,
        references: created.references,
        notes: created.notes,
        status: created.status,
        vendorId: created.vendorId,
        createdAt: created.createdAt,
      },
      { status: 201 }
    );
  } catch (e) {
    console.error("[POST /api/doz/vendors]", e);
    return NextResponse.json(
      { error: "Failed to process vendor request" },
      { status: 500 }
    );
  }
}

// ------------------------------------------------------------
// PATCH — approve or reject an application (staff/founder)
//   APPROVE: create Vendor, link application (transactional)
//   REJECT:  mark application REJECTED
// ------------------------------------------------------------
export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const applicationId = String(body.applicationId ?? "").trim();
    const action = String(body.action ?? "").trim().toUpperCase();

    if (!applicationId) {
      return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
    }
    if (action !== "APPROVE" && action !== "REJECT") {
      return NextResponse.json(
        { error: 'action must be "APPROVE" or "REJECT"' },
        { status: 400 }
      );
    }

    const application = await db.vendorApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    if (application.status !== "PENDING") {
      return NextResponse.json(
        {
          error: `Application is already ${application.status}`,
          status: application.status,
        },
        { status: 409 }
      );
    }

    // ---- REJECT ----
    if (action === "REJECT") {
      const updated = await db.vendorApplication.update({
        where: { id: applicationId },
        data: { status: "REJECTED" },
      });
      return NextResponse.json({
        application: {
          id: updated.id,
          companyName: updated.companyName,
          status: updated.status,
          vendorId: updated.vendorId,
        },
      });
    }

    // ---- APPROVE ----
    // Transaction: create Vendor + mark application APPROVED + link vendorId
    const result = await db.$transaction(async (tx) => {
      const bankAccountString =
        application.bankName || application.bankAccount
          ? `${application.bankName ?? "—"} — ${application.bankAccount ?? "—"}`
          : null;

      const newVendor = await tx.vendor.create({
        data: {
          name: application.companyName,
          category: application.category,
          contactName: application.contactName,
          phone: application.phone,
          email: application.email,
          bankAccount: bankAccountString,
          isActive: true,
        },
      });

      const updatedApp = await tx.vendorApplication.update({
        where: { id: applicationId },
        data: {
          status: "APPROVED",
          vendorId: newVendor.id,
        },
      });

      return { vendor: newVendor, application: updatedApp };
    });

    return NextResponse.json({
      vendor: {
        id: result.vendor.id,
        name: result.vendor.name,
        category: result.vendor.category,
        contactName: result.vendor.contactName,
        phone: result.vendor.phone,
        email: result.vendor.email,
        bankAccount: result.vendor.bankAccount,
        rating: result.vendor.rating,
        totalSpent: result.vendor.totalSpent,
        isActive: result.vendor.isActive,
        createdAt: result.vendor.createdAt,
      },
      application: {
        id: result.application.id,
        status: result.application.status,
        vendorId: result.application.vendorId,
      },
    });
  } catch (e) {
    console.error("[PATCH /api/doz/vendors]", e);
    return NextResponse.json(
      { error: "Failed to process application action" },
      { status: 500 }
    );
  }
}
