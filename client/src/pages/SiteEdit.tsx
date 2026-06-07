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
import { ArrowLeft } from "lucide-react";
import { FrequencyPicker } from "@/components/FrequencyPicker";
import { frequencyToValue, valueToDays } from "@/lib/due";
import type { Site } from "@shared/schema";

export default function SiteEdit() {
  const params = useParams();
  const siteId = Number(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: site, isLoading } = useQuery<Site>({ queryKey: ["/api/sites", siteId] });

  const [form, setForm] = useState({ name: "", address: "", clientName: "", clientEmail: "", clientPhone: "", notes: "" });
  const [frequency, setFrequency] = useState("monthly");
  const [customDays, setCustomDays] = useState(30);
  useEffect(() => {
    if (site) {
      setForm({
        name: site.name, address: site.address, clientName: site.clientName,
        clientEmail: site.clientEmail, clientPhone: site.clientPhone, notes: site.notes,
      });
      const f = frequencyToValue(site.inspectionFrequencyDays);
      setFrequency(f.value);
      setCustomDays(f.customDays);
    }
  }, [site]);

  const save = useMutation({
    mutationFn: async () =>
      (await apiRequest("PATCH", `/api/sites/${siteId}`, {
        ...form,
        inspectionFrequencyDays: valueToDays(frequency, customDays),
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
