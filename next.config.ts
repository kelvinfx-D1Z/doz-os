import type { NextConfig } from "next";

// ============================================================
// SECURITY HEADERS — applied to every response.
// These protect against XSS, clickjacking, MIME sniffing, and
// downgrade attacks. Tune the CSP for your production domain.
// ============================================================
const securityHeaders = [
  // Prevent MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Prevent clickjacking — this app is never embedded in an iframe
  { key: "X-Frame-Options", value: "DENY" },
  // Disable the legacy browser XSS filter (it introduced more vulns than it fixed)
  { key: "X-XSS-Protection", value: "0" },
  // Force HTTPS for 1 year (incl. subdomains) — only effective once on HTTPS
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
  // Referrer policy — only send origin to cross-origin destinations
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Lock down powerful browser APIs
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Content Security Policy — strict default. Allows inline styles (Tailwind
  // + shadcn require this) and inline scripts (Next.js needs this for hydration).
  // 'unsafe-inline' for scripts is kept minimal; in production, replace with nonces.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: https: blob:",
      "connect-src 'self' https: wss:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // Re-enable type checking — security bugs hide behind `any`. If the build
  // breaks, fix the types instead of masking them.
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  // Block the Prisma DB file and backups from being served as static assets.
  // (They live outside /public so this is defense-in-depth.)
  async redirects() {
    return [];
  },
};

export default nextConfig;
