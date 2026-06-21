import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, downloadFile } from "@/lib/queryClient";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Building2, MapPin, ClipboardList, AlertTriangle, ChevronRight, Download, Search, X } from "lucide-react";
import { FrequencyPicker, DueBadge } from "@/components/FrequencyPicker";
import { valueToDays } from "@/lib/due";
import type { Site } from "@shared/schema";

type SiteWithStats = Site & { checklistCount: number; inspectionCount: number; openIssues: number };

function SiteFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    address: "",
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    notes: "",
  });
  const [frequency, setFrequency] = useState("monthly");
  const [customDays, setCustomDays] = useState(30);
  const [nextDueDate, setNextDueDate] = useState("");

  const create = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", "/api/sites", {
        ...form,
        inspectionFrequencyDays: valueToDays(frequency, customDays),
        nextDueDate: nextDueDate || undefined,
      })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Site added", description: `${form.name} has been created.` });
      onOpenChange(false);
      setForm({ name: "", address: "", clientName: "", clientEmail: "", clientPhone: "", notes: "" });
      setFrequency("monthly");
      setCustomDays(30);
      setNextDueDate("");
    },
    onError: (e: any) => toast({ title: "Could not save", description: e.message, variant: "destructive" }),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Add Site</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) return;
            create.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="name">Site name *</Label>
            <Input id="name" value={form.name} onChange={set("name")} data-testid="input-site-name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" value={form.address} onChange={set("address")} data-testid="input-site-address" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="clientName">Client contact</Label>
              <Input id="clientName" value={form.clientName} onChange={set("clientName")} data-testid="input-client-name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clientPhone">Contact phone</Label>
              <Input id="clientPhone" value={form.clientPhone} onChange={set("clientPhone")} data-testid="input-client-phone" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="clientEmail">Contact email</Label>
            <Input id="clientEmail" type="email" value={form.clientEmail} onChange={set("clientEmail")} data-testid="input-client-email" />
          </div>
          <FrequencyPicker value={frequency} customDays={customDays} onValueChange={setFrequency} onCustomDaysChange={setCustomDays} />
          <div className="space-y-2">
            <Label htmlFor="nextDueDate">First inspection due date</Label>
            <Input id="nextDueDate" type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} data-testid="input-site-next-due" />
            <p className="text-xs text-muted-foreground">Leave blank to start the cycle from today.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={form.notes} onChange={set("notes")} data-testid="input-site-notes" rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending} data-testid="button-save-site">
              {create.isPending ? "Saving..." : "Add site"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type SiteFilter = "all" | "due" | "overdue" | "open-issues";

export default function Sites() {
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<SiteFilter>("all");
  const { toast } = useToast();
  const { data: sites, isLoading } = useQuery<SiteWithStats[]>({ queryKey: ["/api/sites"] });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const soonCutoff = new Date(today);
  soonCutoff.setDate(soonCutoff.getDate() + 7);

  const q = search.trim().toLowerCase();
  const filteredSites = (sites ?? []).filter((site) => {
    if (q) {
      const hay = `${site.name ?? ""} ${site.address ?? ""} ${site.clientName ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filter === "due") {
      if (!site.nextDueDate) return false;
      const due = new Date(site.nextDueDate);
      due.setHours(0, 0, 0, 0);
      if (due < today || due > soonCutoff) return false;
    } else if (filter === "overdue") {
      if (!site.nextDueDate) return false;
      const due = new Date(site.nextDueDate);
      due.setHours(0, 0, 0, 0);
      if (due >= today) return false;
    } else if (filter === "open-issues") {
      if (!site.openIssues || site.openIssues <= 0) return false;
    }
    return true;
  });

  const hasSites = (sites?.length ?? 0) > 0;
  const filtersActive = q.length > 0 || filter !== "all";

  async function exportSites(fmt: "xlsx" | "csv") {
    try {
      await downloadFile(`/api/export/sites.${fmt}`, `fortis-fm-sites.${fmt}`);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <>
      <PageHeader
        title="Sites"
        description="Facilities under management"
        actions={
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" data-testid="button-export-sites"><Download className="mr-2 h-4 w-4" /> Export</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportSites("xlsx")} data-testid="menu-export-sites-xlsx">Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportSites("csv")} data-testid="menu-export-sites-csv">CSV (.csv)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-add-site">
              <Plus className="mr-2 h-4 w-4" /> Add site
            </Button>
          </div>
        }
      />

      {hasSites && !isLoading && (
        <div className="mb-4 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search sites by name, address, or client"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9"
              data-testid="input-search-sites"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
                data-testid="button-clear-search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              { id: "all", label: "All sites" },
              { id: "due", label: "Due soon" },
              { id: "overdue", label: "Overdue" },
              { id: "open-issues", label: "Has open issues" },
            ] as { id: SiteFilter; label: string }[]).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                data-testid={`filter-${f.id}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : !sites || sites.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-slate-100 p-4">
              <Building2 className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-serif text-lg font-semibold">No sites yet</h3>
            <p className="mb-5 mt-1 max-w-xs text-sm text-muted-foreground">
              Add your first site to start building inspection checklists.
            </p>
            <Button onClick={() => setDialogOpen(true)} data-testid="button-add-first-site">
              <Plus className="mr-2 h-4 w-4" /> Add your first site
            </Button>
          </CardContent>
        </Card>
      ) : filteredSites.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 rounded-full bg-slate-100 p-3">
              <Search className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-serif text-base font-semibold">No matches</h3>
            <p className="mb-4 mt-1 max-w-xs text-sm text-muted-foreground">
              Try a different search or clear the filters.
            </p>
            {filtersActive && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSearch(""); setFilter("all"); }}
                data-testid="button-clear-filters"
              >
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredSites.map((site) => (
            <Link key={site.id} href={`/sites/${site.id}`} data-testid={`card-site-${site.id}`}>
              <Card className="group h-full cursor-pointer transition-shadow hover-elevate">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <h3 className="truncate font-serif text-base font-semibold text-foreground" data-testid={`text-site-name-${site.id}`}>
                        {site.name}
                      </h3>
                      {site.address && (
                        <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 flex-shrink-0" /> {site.address}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                  </div>
                  <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <ClipboardList className="h-3.5 w-3.5" /> {site.checklistCount} checks
                    </span>
                    <span className="flex items-center gap-1.5">
                      {site.inspectionCount} inspections
                    </span>
                    {site.openIssues > 0 && (
                      <span className="ml-auto flex items-center gap-1.5 font-medium text-red-600">
                        <AlertTriangle className="h-3.5 w-3.5" /> {site.openIssues} open
                      </span>
                    )}
                  </div>
                  {site.nextDueDate && (
                    <div className="mt-3">
                      <DueBadge nextDueDate={site.nextDueDate} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <SiteFormDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
