# P2-D — Receipt Upload (Phase 2)

Agent: Receipt Upload Builder
Task ID: P2-D
Parent task: Phase 2 (post-auth feature drop)

## Goal
Build receipt upload for expenses: file upload API (multipart/form-data) that saves the receipt to `/home/z/my-project/public/upload/` and links it to the Expense record, marking it verified. Then integrate the upload UI into the existing Financial Intelligence module's Expenses tab.

## Files created / edited
- `src/app/api/doz/expenses/route.ts` (NEW) — GET list expenses + POST upload receipt (multipart/form-data)
- `src/components/doz/receipt-upload.tsx` (NEW) — per-row upload button component
- `src/components/modules/financial.tsx` (EDITED) — Expenses tab now has a Receipt column + summary + refetch wiring
- `src/app/api/doz/finance/route.ts` (EDITED) — added `receiptUrl: e.receiptUrl` to the expensesOut mapping (one line)

## API design
### GET /api/doz/expenses
Returns:
```json
{
  "expenses": [{ "id", "category", "description", "amount", "expenseDate", "isVerified", "receiptUrl", "project": {"name"}, "vendor": {"name"} }],
  "stats": { "total", "verified", "unverified", "withReceipt" }
}
```

### POST /api/doz/expenses (multipart/form-data)
Accepts:
- `file` (File) — image/* or application/pdf, max 10MB
- `expenseId` (string)

Implementation:
- Validates required fields, file size, and MIME type (with fallback extension recovery from filename for browsers that report generic types)
- Verifies the expense exists in DB (404 if not)
- Ensures `/home/z/my-project/public/upload/` exists (mkdir recursive)
- Saves file as `receipt-<safeId>-<timestamp>.<ext>` where safeId is the expenseId with non-alphanumeric chars stripped
- Converts File to Buffer via `await file.arrayBuffer()` → `Buffer.from(bytes)`
- Updates Expense: `receiptUrl = "/upload/<filename>"`, `isVerified = true`
- Returns `{ success: true, expense: {...}, receiptUrl, filename }`
- Error handling: 400 (bad request / unsupported type / too large), 404 (expense not found), 500 (server error)

## ReceiptUpload component
Props: `{ expenseId, currentReceiptUrl?, isVerified, onUploaded? }`

Behavior:
- If `currentReceiptUrl` exists: shows "View" link (opens in new tab) + emerald CheckCircle2 (if isVerified) + small "Replace" button
- If no receipt but isVerified=true: shows emerald CheckCircle2 + "Upload" button
- If no receipt and not verified: shows "Upload" button with Upload icon
- On file select: validates type + size client-side, POSTs multipart to `/api/doz/expenses`, shows Loader2 spinner while uploading, toast (sonner) on success/failure, calls `onUploaded` to refresh parent
- Hidden `<input type="file" accept="image/*,application/pdf">` opened via ref.click()
- Button: size sm, variant outline, gap-1
- Receipt link: text-primary underline-offset-2 hover:underline, opens in new tab (target=_blank rel=noopener noreferrer)
- Verified badge: emerald CheckCircle2

## financial.tsx integration
- Added `receiptUrl?: string | null` to Expense interface
- Imported ReceiptUpload from `@/components/doz/receipt-upload`
- Imported `Paperclip` icon from lucide-react
- Imported `useCallback` from react
- Created `loadData` useCallback that fetches `/api/doz/finance` (preserved existing useEffect for initial load with cancelled-flag)
- Passed `onRefresh={loadData}` to ExpensesTable, which forwards it as `onUploaded` to each ReceiptUpload
- Added a "Receipt" column header to the expenses table
- Added a ReceiptUpload cell to each expense row
- Added a summary line under the SectionHeader: "X/N with receipt · Y/N verified" with Paperclip + CheckCircle2 icons

## Finance API change
The `/api/doz/finance` route's `expensesOut` mapping was missing `receiptUrl`. Added one line: `receiptUrl: e.receiptUrl,` so the existing financial.tsx fetch includes it. isVerified was already mapped.

## Static file serving
Receipts are saved to `/home/z/my-project/public/upload/<filename>` and served at `/upload/<filename>` via Next.js's static file serving for the `public/` directory. Verified with curl HEAD request: returns HTTP 200, Content-Type: application/pdf, Content-Length matches.

## Testing results

### GET /api/doz/expenses
```bash
curl -s http://localhost:3000/api/doz/expenses
```
- HTTP 200
- Returns 17 expenses with all required fields (id, category, description, amount, expenseDate, isVerified, receiptUrl, project.name, vendor.name)
- stats: `{ total: 17, verified: 12, unverified: 5, withReceipt: 0 }` (before uploads)

### POST /api/doz/expenses (success)
```bash
curl -X POST http://localhost:3000/api/doz/expenses \
  -F "file=@/tmp/test-receipt.txt;filename=receipt.pdf;type=application/pdf" \
  -F "expenseId=cmqu1escu006prhx8l5iu0imu"
```
- HTTP 200
- Returns `{ success: true, expense: {...isVerified: true, receiptUrl: "/upload/receipt-cmqu1escu006prhx8l5iu0imu-1782425337849.pdf"}, receiptUrl, filename }`
- File saved to `/home/z/my-project/public/upload/receipt-cmqu1escu006prhx8l5iu0imu-1782425337849.pdf` (42 bytes)
- Static serving at `/upload/receipt-...pdf` returns HTTP 200 with `Content-Type: application/pdf`
- Subsequent GET shows the expense with isVerified=true and receiptUrl populated; stats now `verified: 13, unverified: 4, withReceipt: 1`

### POST error paths (all 400/404 with helpful messages)
- Missing expenseId → 400 `"Missing required field: expenseId"`
- Missing file → 400 `"Missing required field: file (must be a File)"`
- Invalid expenseId → 404 `"Expense not found for id=nonexistent_id"`
- Wrong type (text/plain) → 400 `"Unsupported file type: text/plain. Only images (image/*) or PDF (application/pdf) are allowed."`

### Also tested image/png upload — success, file saved with .png extension

### Lint
`bun run lint` → EXIT 0, zero errors, zero warnings.

### Page render
`curl http://localhost:3000/` → HTTP 200, 29614 bytes. Page compiles cleanly with all changes (Turbopack recompile successful).

### Dev log entries
```
GET  /api/doz/expenses 200 in 9ms
POST /api/doz/expenses 200 in 11ms  (successful upload)
POST /api/doz/expenses 400 in 7ms   (missing field tests)
POST /api/doz/expenses 404 in 9ms   (invalid expenseId)
POST /api/doz/expenses 400 in 7ms   (unsupported type)
GET  /api/doz/finance  200 in 136ms (still works after edit)
GET  /                  200 in 5.8s  (page renders with new Receipt column)
```

## Color discipline
- Emerald: verified checkmarks, primary actions, "Receipt uploaded" toast
- Amber: pending status, AlertTriangle in pending rows
- Rose: not used in this feature (reserved for errors elsewhere)
- NO indigo / blue anywhere

## Files preserved
- prisma/schema.prisma — NOT modified (Expense.receiptUrl already existed from P2-A)
- All other modules untouched
- Existing finance functionality (cashflow chart, P&L tables, invoices, budgets) all intact — only the expenses table got a new column + summary line
