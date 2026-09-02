// ============================================================
// ENABLE ROW-LEVEL SECURITY ON EVERY PUBLIC TABLE
//
// WHY THIS EXISTS
// Supabase serves a PostgREST API over the `public` schema on the open
// internet. The `anon` role holds SELECT on every table, so with RLS off,
// anyone with the project URL and the anon key could read User (password
// hashes included), RecoveryCode, Invoice, Quotation, Receipt, Vendor bank
// details and CompanySettings. Supabase flagged it as two Critical findings
// on 31 Aug 2026: rls_disabled_in_public and sensitive_columns_exposed.
//
// WHY IT IS SAFE FOR THIS APP
// DOZ OS never touches PostgREST — there is no @supabase/supabase-js anywhere
// in src/ and no anon key in the environment. Prisma connects over the wire
// protocol as `postgres`, which has rolbypassrls = true and therefore ignores
// row security completely. Enabling RLS with NO policies denies anon and
// authenticated everything while leaving the application untouched.
//
// Checked, not assumed: this script refuses to run unless the role it is
// connected as actually bypasses RLS. If that ever stops being true, enabling
// RLS without policies would lock the app out of its own database, so the
// guard fails closed rather than bricking production.
//
// RUN IT AGAIN AFTER EVERY SCHEMA CHANGE. `prisma db push` creates new tables
// with RLS off, which silently reopens the hole for that table.
//
// Safe by construction: the only statement issued is
//   ALTER TABLE "x" ENABLE ROW LEVEL SECURITY
// No policies are created, no grants changed, no data touched. Reverse any
// table with ALTER TABLE "x" DISABLE ROW LEVEL SECURITY.
// ============================================================

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const [role] = await db.$queryRawUnsafe(
    "SELECT current_user AS name, r.rolbypassrls, r.rolsuper " +
      "FROM pg_roles r WHERE r.rolname = current_user"
  );
  console.log(`Connected as "${role.name}" (bypassrls=${role.rolbypassrls}, superuser=${role.rolsuper})`);

  if (!role.rolbypassrls && !role.rolsuper) {
    console.error(
      `\nREFUSING TO RUN. "${role.name}" does not bypass row security, so enabling RLS\n` +
        "with no policies would lock this application out of its own data.\n" +
        "Add policies for this role first, or connect as one that bypasses RLS."
    );
    process.exitCode = 1;
    return;
  }

  const tables = await db.$queryRawUnsafe(
    "SELECT c.relname AS name, c.relrowsecurity AS enabled " +
      "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace " +
      "WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname"
  );
  console.log(`Found ${tables.length} table(s) in the public schema.\n`);

  let enabled = 0;
  let already = 0;
  const failed = [];

  for (const t of tables) {
    if (t.enabled) {
      already++;
      console.log(`  - "${t.name}": already on, skipped.`);
      continue;
    }
    try {
      // The name comes from pg_class, not from user input, and is quoted.
      await db.$executeRawUnsafe(`ALTER TABLE "${t.name}" ENABLE ROW LEVEL SECURITY`);
      enabled++;
      console.log(`  + "${t.name}": RLS enabled.`);
    } catch (e) {
      failed.push(t.name);
      console.log(`  ! "${t.name}": FAILED — ${e.message.split("\n")[0]}`);
    }
  }

  const [after] = await db.$queryRawUnsafe(
    "SELECT count(*)::int AS total, " +
      "count(*) FILTER (WHERE c.relrowsecurity)::int AS on_count, " +
      "count(*) FILTER (WHERE NOT c.relrowsecurity)::int AS off_count " +
      "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace " +
      "WHERE n.nspname = 'public' AND c.relkind = 'r'"
  );

  console.log(
    `\nSummary: ${enabled} enabled, ${already} already on, ${failed.length} failed.\n` +
      `Public schema now: ${after.on_count} of ${after.total} tables protected, ${after.off_count} still open.`
  );

  if (after.off_count > 0) {
    console.log("\nStill unprotected — these remain readable by the anon API:");
    const open = await db.$queryRawUnsafe(
      "SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace " +
        "WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity ORDER BY 1"
    );
    for (const o of open) console.log(`  ! ${o.name}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
