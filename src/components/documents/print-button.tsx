"use client";

/**
 * The only interactive bit of the print page. Pulled into its own client
 * component because the page itself is a server component (it needs
 * getSessionUser() and a DB read), and window.print() only exists client-side.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      style={{
        padding: "8px 16px",
        background: "#232323",
        color: "#fff",
        border: "none",
        borderRadius: 6,
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      Print / Save as PDF
    </button>
  );
}
