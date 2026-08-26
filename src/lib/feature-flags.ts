/**
 * Feature kill switches.
 *
 * CLIENT_PORTAL_ENABLED
 * ----------------------
 * The founder's delivery model is download-and-email: invoices and budgets
 * are downloaded from DOZ OS and emailed to the client directly. Clients do
 * not log into the OS. Production confirms this — 0 accounts have
 * `portalActive` and 0 portal tokens have ever been issued — so the client
 * portal (`ClientPortal`, `/api/doz/portal`, and the share-link control in
 * CRM) is switched off here rather than removed.
 *
 * The route, component and schema fields (`portalToken` / `portalActive`)
 * all stay in place. If the delivery model ever changes and clients need
 * direct access again, flip this back to `true` — that is the one line
 * that re-enables it everywhere it is checked.
 */
export const CLIENT_PORTAL_ENABLED = false;
