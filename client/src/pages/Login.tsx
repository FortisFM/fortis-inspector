import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import logoNavy from "@assets/logo-navy-on-white.jpg";

export default function Login() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("admin@fortisfm.com.au");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [reasonBanner, setReasonBanner] = useState<string>("");

  useEffect(() => {
    try {
      const r = sessionStorage.getItem("fortis_logout_reason");
      if (r === "idle") setReasonBanner("You were signed out after 30 minutes of inactivity. Please sign in again.");
      else if (r === "closed") setReasonBanner("Your session ended when the app was closed. Please sign in again.");
      sessionStorage.removeItem("fortis_logout_reason");
    } catch {}
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      toast({
        title: "Sign in failed",
        description: err?.message?.replace(/^\d+:\s*/, "") || "Check your credentials and try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src={logoNavy} alt="Fortis FM Facilities Management Specialists" className="mx-auto h-20 w-auto" data-testid="img-logo-login" />
        </div>
        <Card className="border-card-border shadow-sm">
          <CardContent className="pt-6">
            <h1 className="mb-1 font-serif text-xl font-semibold text-foreground">Fortis FM Inspector</h1>
            <p className="mb-6 text-sm text-muted-foreground">Sign in to manage sites and inspections.</p>
            {reasonBanner && (
              <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="text-logout-reason">
                {reasonBanner}
              </div>
            )}
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="input-email"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="input-password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="button-login">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          (07) 3472 7579 &middot; admin@fortisfm.com.au
        </p>
      </div>
    </div>
  );
}
