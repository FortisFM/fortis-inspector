import { useEffect, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, AlertCircle, RotateCw } from "lucide-react";
import { FrequencyPicker } from "@/components/FrequencyPicker";
import { frequencyToValue, valueToDays } from "@/lib/due";
import { slugify } from "@shared/slug";
import type { Site } from "@shared/schema";

export default function SiteEdit() {
  const params = useParams();
  const siteId = Number(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: site, isLoading } = useQuery<Site>({ queryKey: ["/api/sites", siteId] });

  const [form, setForm] = useState({ name: "", address: "", clientName: "", clientEmail: "", clientPhone: "", notes: "", hubSlug: "" });
  const [frequency, setFrequency] = useState("monthly");
  const [customDays, setCustomDays] = useState(30);
  const [nextDueDate, setNextDueDate] = useState("");
  const [slugOverridden, setSlugOverridden] = useState(false);
  const [verifyResult, setVerifyResult] = useState<null | { ok: boolean; message: string }>(null);
  useEffect(() => {
    if (site) {
      setForm({
        name: site.name, address: site.address, clientName: site.clientName,
        clientEmail: site.clientEmail, clientPhone: site.clientPhone, notes: site.notes,
        hubSlug: (site as any).hubSlug || slugify(site.name || ""),
      });
      const f = frequencyToValue(site.inspectionFrequencyDays);
      setFrequency(f.value);
      setCustomDays(f.customDays);
      // site.nextDueDate is stored as YYYY-MM-DD; if it has a time component, trim it
      setNextDueDate(site.nextDueDate ? String(site.nextDueDate).slice(0, 10) : "");
      // Slug is considered overridden if it does not match auto-derived from current name
      const auto = slugify(site.name || "");
      const stored = (site as any).hubSlug || "";
      setSlugOverridden(Boolean(stored && stored !== auto));
    }
  }, [site]);

  // Auto-derive slug from name when user has not manually overridden it.
  useEffect(() => {
    if (!slugOverridden) {
      setForm((f) => ({ ...f, hubSlug: slugify(f.name) }));
    }
    // Clear any stale verify result when the slug changes
    setVerifyResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name]);

  const verify = useMutation({
    mutationFn: async (slug: string) =>
      (await apiRequest("GET", `/api/hub/site-check?slug=${encodeURIComponent(slug)}`)).json(),
    onSuccess: (res: any) => {
      if (res?.match) {
        setVerifyResult({ ok: true, message: `Match found in Hub: ${res.match.name || form.hubSlug}` });
      } else if (res?.suggestions?.length) {
        setVerifyResult({ ok: false, message: `No exact match. Hub suggestions: ${res.suggestions.slice(0, 3).join(", ")}` });
      } else {
        setVerifyResult({ ok: false, message: "No match in Hub. Add this site on the Hub first, or update the slug here to match an existing Hub site. Work Requests will fail until the slug matches." });
      }
    },
    onError: (e: any) =>
      setVerifyResult({ ok: false, message: e?.message || "Could not reach the Hub." }),
  });

  const save = useMutation({
    mutationFn: async () =>
      (await apiRequest("PATCH", `/api/sites/${siteId}`, {
        ...form,
        hubSlug: form.hubSlug.trim() || slugify(form.name),
        inspectionFrequencyDays: valueToDays(frequency, customDays),
        nextDueDate: nextDueDate,
      })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites", siteId] });
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Site updated" });
      navigate(`/sites/${siteId}`);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <>
      <Link href={`/sites/${siteId}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to site
      </Link>
      <PageHeader title="Edit site" />
      <Card>
        <CardContent className="p-5">
          <form onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) save.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Site name *</Label>
              <Input id="name" value={form.name} onChange={set("name")} data-testid="input-edit-name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={form.address} onChange={set("address")} data-testid="input-edit-address" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="clientName">Client contact</Label>
                <Input id="clientName" value={form.clientName} onChange={set("clientName")} data-testid="input-edit-client-name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientPhone">Phone</Label>
                <Input id="clientPhone" value={form.clientPhone} onChange={set("clientPhone")} data-testid="input-edit-client-phone" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientEmail">Email</Label>
              <Input id="clientEmail" type="email" value={form.clientEmail} onChange={set("clientEmail")} data-testid="input-edit-client-email" />
            </div>
            <FrequencyPicker value={frequency} customDays={customDays} onValueChange={setFrequency} onCustomDaysChange={setCustomDays} />
            <div className="space-y-2">
              <Label htmlFor="nextDueDate">Next inspection due date</Label>
              <Input id="nextDueDate" type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} data-testid="input-edit-next-due" />
              <p className="text-xs text-muted-foreground">Set the date the next inspection is due. The cycle continues from this date.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hubSlug">Fortis FM Hub slug</Label>
              <div className="flex gap-2">
                <Input
                  id="hubSlug"
                  value={form.hubSlug}
                  onChange={(e) => { setSlugOverridden(true); setForm((f) => ({ ...f, hubSlug: e.target.value })); setVerifyResult(null); }}
                  placeholder="auto-generated from site name"
                  data-testid="input-edit-hub-slug"
                />
                {slugOverridden && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Reset to auto"
                    onClick={() => { setSlugOverridden(false); setForm((f) => ({ ...f, hubSlug: slugify(f.name) })); setVerifyResult(null); }}
                    data-testid="button-reset-slug"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => verify.mutate(form.hubSlug.trim() || slugify(form.name))}
                  disabled={verify.isPending || !(form.hubSlug.trim() || form.name.trim())}
                  data-testid="button-verify-hub"
                >
                  {verify.isPending ? "Checking..." : "Verify against Hub"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Identifier used when posting Work Requests to the Fortis FM Hub. Auto-generated from the site name. Override only when the Hub already uses a different slug for this site.</p>
              {verifyResult && (
                <div className={`flex items-start gap-1.5 text-xs ${verifyResult.ok ? "text-green-700" : "text-amber-700"}`} data-testid="text-verify-result">
                  {verifyResult.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5" /> : <AlertCircle className="mt-0.5 h-3.5 w-3.5" />}
                  <span>{verifyResult.message}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={set("notes")} rows={3} data-testid="input-edit-notes" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(`/sites/${siteId}`)}>Cancel</Button>
              <Button type="submit" disabled={save.isPending} data-testid="button-save-edit">Save changes</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
