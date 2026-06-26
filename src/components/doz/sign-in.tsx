"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const PERSONAS = [
  { label: "Founder", email: "founder@digitonezero.com", role: "FOUNDER", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { label: "Ops Lead", email: "ops@digitonezero.com", role: "STAFF", color: "bg-teal-500/15 text-teal-300 border-teal-500/30" },
  { label: "Finance", email: "finance@digitonezero.com", role: "STAFF", color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { label: "Intern", email: "chioma@digitonezero.com", role: "INTERN", color: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  { label: "Freelancer", email: "bola@freelance.ng", role: "FREELANCER", color: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
];

export function SignIn() {
  const [email, setEmail] = useState("founder@digitonezero.com");
  const [password, setPassword] = useState("doz2025");
  const [loading, setLoading] = useState(false);

  async function handleSignIn(e?: React.FormEvent, emailOverride?: string) {
    e?.preventDefault();
    setLoading(true);
    // Use redirect: true so the browser follows the redirect and the cookie
    // is fully established before the page renders (more reliable in iframes)
    await signIn("credentials", {
      email: emailOverride ?? email,
      password,
      redirect: true,
      callbackUrl: "/",
    });
  }

  function quickSignIn(em: string) {
    setEmail(em);
    handleSignIn(undefined, em);
  }

  return (
    <div className="bg-grid flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary font-mono text-xl font-bold text-primary-foreground shadow-lg shadow-primary/20">
            10
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">DOZ OS</h1>
          <p className="text-sm text-muted-foreground">Digit One Zero Operating System</p>
        </div>

        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Sign in to your workspace</h2>
          </div>

          <form onSubmit={handleSignIn} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@digitonezero.com"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Sign in <ArrowRight className="ml-1 h-4 w-4" /></>}
            </Button>
          </form>

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-2 text-[10px] uppercase tracking-wider text-muted-foreground">Quick demo sign-in</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {PERSONAS.map((p) => (
              <button
                key={p.email}
                onClick={() => quickSignIn(p.email)}
                disabled={loading}
                className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors hover:opacity-80 ${p.color}`}
              >
                <span className="block font-semibold">{p.label}</span>
                <span className="block text-[10px] opacity-70">{p.role}</span>
              </button>
            ))}
          </div>

          <p className="text-center text-[10px] text-muted-foreground">
            Demo password for all accounts: <code className="rounded bg-muted px-1 py-0.5 font-mono">doz2025</code>
          </p>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground">
          Digit One Zero Ltd · Lagos, Nigeria · v2.0
        </p>
      </div>
    </div>
  );
}
