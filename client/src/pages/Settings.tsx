import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { API_BASE, getAuthToken, setAuthToken, apiRequest } from "@/lib/queryClient";
import { useAiStatus } from "@/hooks/use-ai-status";
import { useToast } from "@/hooks/use-toast";
import { Phone, Mail, Building2, Download, Bell, BellOff, Sparkles, Check } from "lucide-react";
import logoNavy from "@assets/logo-navy-on-white.jpg";

type PushKey = { enabled: boolean; publicKey: string };

// Convert a base64url VAPID key to the Uint8Array the Push API expects.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function Settings() {
  const { user } = useAuth();
  const aiEnabled = useAiStatus();
  const { toast } = useToast();

  // Install prompt handling.
  const [installEvent, setInstallEvent] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Detect already-installed (standalone) sessions.
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function doInstall() {
    if (!installEvent) return;
    installEvent.prompt();
    try {
      await installEvent.userChoice;
    } catch {
      // ignore
    }
    setInstallEvent(null);
  }

  // Push notification key (only show controls if the server has VAPID set up).
  const { data: pushKey } = useQuery<PushKey>({ queryKey: ["/api/push/key"] });
  const [notifBusy, setNotifBusy] = useState(false);
  const [notifOn, setNotifOn] = useState(false);

  useEffect(() => {
    let active = true;
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          if (active) setNotifOn(!!sub);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, []);

  async function enableNotifications() {
    if (!pushKey?.enabled || !pushKey.publicKey) return;
    setNotifBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast({ title: "Notifications blocked", description: "Allow notifications in your browser to receive reminders." });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pushKey.publicKey),
      });
      const json: any = sub.toJSON();
      const res = await fetch(`${API_BASE}/api/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error("Could not save subscription");
      setNotifOn(true);
      toast({ title: "Notifications on", description: "You will be reminded when inspections fall due." });
    } catch (e: any) {
      toast({ title: "Could not enable notifications", description: e.message, variant: "destructive" });
    } finally {
      setNotifBusy(false);
    }
  }

  async function disableNotifications() {
    setNotifBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const json: any = sub.toJSON();
        await fetch(`${API_BASE}/api/push/unsubscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
          body: JSON.stringify({ endpoint: json.endpoint }),
        });
        await sub.unsubscribe();
      }
      setNotifOn(false);
      toast({ title: "Notifications off" });
    } catch (e: any) {
      toast({ title: "Could not turn off notifications", description: e.message, variant: "destructive" });
    } finally {
      setNotifBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" description="Account and company details" />
      <div className="space-y-5">
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 font-serif text-base font-semibold">Account</h2>
            <Row label="Name" value={user?.name || ""} />
            <Row label="Email" value={user?.email || ""} />
          </CardContent>
        </Card>

        {/* Install as app */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-1 font-serif text-base font-semibold">Install app</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Add Fortis Inspector to your home screen for full-screen use and faster access in the field.
            </p>
            {installed ? (
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-600" data-testid="text-app-installed">
                <Check className="h-4 w-4" /> Installed on this device
              </p>
            ) : installEvent ? (
              <Button onClick={doInstall} data-testid="button-install-app">
                <Download className="mr-2 h-4 w-4" /> Install app
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-install-hint">
                Use your browser menu, then choose Add to Home Screen or Install, to add the app.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Push notifications (only if server VAPID keys are configured) */}
        {pushKey?.enabled && (
          <Card>
            <CardContent className="p-5">
              <h2 className="mb-1 font-serif text-base font-semibold">Notifications</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Get a reminder when a site inspection falls due or runs overdue.
              </p>
              {notifOn ? (
                <Button variant="outline" onClick={disableNotifications} disabled={notifBusy} data-testid="button-disable-notifications">
                  <BellOff className="mr-2 h-4 w-4" /> Turn off notifications
                </Button>
              ) : (
                <Button onClick={enableNotifications} disabled={notifBusy} data-testid="button-enable-notifications">
                  <Bell className="mr-2 h-4 w-4" /> Enable notifications
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* AI features status */}
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-1 flex items-center gap-2 font-serif text-base font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> AI features
            </h2>
            {aiEnabled ? (
              <p className="text-sm text-muted-foreground" data-testid="text-ai-enabled">
                AI is on. Photo analysis, note polishing and executive summaries are available during inspections.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-ai-disabled">
                AI features are off. Add an OPENAI_API_KEY on the server to turn on photo analysis, note polishing
                and executive summaries. See the README for setup.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <img src={logoNavy} alt="Fortis FM" className="h-10 w-auto" />
            </div>
            <h2 className="mb-1 font-serif text-base font-semibold">Fortis FM</h2>
            <p className="mb-4 text-sm text-muted-foreground">Facilities Management Specialists</p>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> (07) 3472 7579</p>
              <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> admin@fortisfm.com.au</p>
              <p className="flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" /> Brisbane, QLD</p>
            </div>
          </CardContent>
        </Card>

        <ChangePasswordCard />

        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            <h2 className="mb-2 font-serif text-base font-semibold text-foreground">Email sending</h2>
            <p>
              Contractor emails currently open in your mail app or copy to clipboard. To enable automated
              Microsoft 365 sending, see the README for SMTP app-password or Graph API setup instructions.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function ChangePasswordCard() {
  const { toast } = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (next !== confirm) {
      toast({ title: "Passwords do not match", description: "Re-enter the new password.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await apiRequest("POST", "/api/me/password", {
        currentPassword: current,
        newPassword: next,
      });
      const data = await res.json();
      if (data.token) setAuthToken(data.token);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast({ title: "Password updated", description: "Other devices have been signed out." });
    } catch (err: any) {
      const message = err?.message || "Could not update password";
      toast({ title: "Update failed", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="mb-3 font-serif text-base font-semibold">Change password</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Use at least 8 characters. Updating your password will sign out any other devices you are logged in on.
        </p>
        <form onSubmit={submit} className="space-y-3" data-testid="form-change-password">
          <div>
            <Label htmlFor="pw-current">Current password</Label>
            <Input
              id="pw-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              data-testid="input-current-password"
            />
          </div>
          <div>
            <Label htmlFor="pw-new">New password</Label>
            <Input
              id="pw-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              minLength={8}
              data-testid="input-new-password"
            />
          </div>
          <div>
            <Label htmlFor="pw-confirm">Confirm new password</Label>
            <Input
              id="pw-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              data-testid="input-confirm-password"
            />
          </div>
          <div className="pt-1">
            <Button type="submit" disabled={saving} data-testid="button-change-password">
              {saving ? "Updating..." : "Update password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
