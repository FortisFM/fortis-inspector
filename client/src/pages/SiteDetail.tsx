import { useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SeverityBadge, IssueStatusBadge } from "@/lib/badges";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, ArrowUp, ArrowDown, Camera, Play, FileText,
  ClipboardList, Copy, MapPin, User, Mail, Phone, ArrowLeft, AlertTriangle, ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import type { Site, ChecklistItem, Inspection } from "@shared/schema";

export default function SiteDetail() {
  const params = useParams();
  const siteId = Number(params.id);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: site, isLoading: siteLoading } = useQuery<Site>({ queryKey: ["/api/sites", siteId] });
  const { data: checklist, isLoading: clLoading } = useQuery<ChecklistItem[]>({
    queryKey: ["/api/sites", siteId, "checklist"],
  });
  const { data: inspections } = useQuery<Inspection[]>({ queryKey: ["/api/sites", siteId, "inspections"] });
  const { data: allSites } = useQuery<Site[]>({ queryKey: ["/api/sites"] });
  const { data: issues } = useQuery<any[]>({ queryKey: ["/api/issues"] });

  const siteIssues = (issues || []).filter((i) => i.siteId === siteId && i.status !== "resolved");

  // checklist item dialog
  const [itemDialog, setItemDialog] = useState<{ open: boolean; edit?: ChecklistItem }>({ open: false });
  const [itemForm, setItemForm] = useState({ label: "", section: "", requiresPhoto: false });
  const [dupOpen, setDupOpen] = useState(false);
  const [dupFrom, setDupFrom] = useState<string>("");
  const [deleteSiteOpen, setDeleteSiteOpen] = useState(false);

  function openNewItem() {
    setItemForm({ label: "", section: "", requiresPhoto: false });
    setItemDialog({ open: true });
  }
  function openEditItem(item: ChecklistItem) {
    setItemForm({ label: item.label, section: item.section, requiresPhoto: item.requiresPhoto });
    setItemDialog({ open: true, edit: item });
  }

  const invalidateChecklist = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/sites", siteId, "checklist"] });

  const saveItem = useMutation({
    mutationFn: async () => {
      if (itemDialog.edit) {
        return (await apiRequest("PATCH", `/api/checklist/${itemDialog.edit.id}`, itemForm)).json();
      }
      return (await apiRequest("POST", `/api/sites/${siteId}/checklist`, itemForm)).json();
    },
    onSuccess: () => {
      invalidateChecklist();
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      setItemDialog({ open: false });
      toast({ title: itemDialog.edit ? "Item updated" : "Item added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/checklist/${id}`),
    onSuccess: () => { invalidateChecklist(); toast({ title: "Item deleted" }); },
  });
  const moveItem = useMutation({
    mutationFn: async ({ id, direction }: { id: number; direction: "up" | "down" }) =>
      apiRequest("POST", `/api/checklist/${id}/move`, { direction }),
    onSuccess: invalidateChecklist,
  });
  const duplicate = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/sites/${siteId}/checklist/duplicate`, { fromSiteId: Number(dupFrom) })).json(),
    onSuccess: (d: any) => {
      invalidateChecklist();
      setDupOpen(false);
      setDupFrom("");
      toast({ title: "Checklist copied", description: `${d.count} items added.` });
    },
  });
  const startInspection = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/sites/${siteId}/inspections`)).json(),
    onSuccess: (insp: Inspection) => navigate(`/sites/${siteId}/inspect/${insp.id}`),
  });
  const deleteSite = useMutation({
    mutationFn: async () => apiRequest("DELETE", `/api/sites/${siteId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      toast({ title: "Site deleted" });
      navigate("/");
    },
  });

  const [deleteInspectionId, setDeleteInspectionId] = useState<number | null>(null);
  const deleteInspection = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/inspections/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sites", siteId, "inspections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/issues"] });
      setDeleteInspectionId(null);
      toast({ title: "Draft deleted" });
    },
    onError: (e: any) => toast({ title: "Could not delete", description: e.message, variant: "destructive" }),
  });

  if (siteLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!site) return <p>Site not found.</p>;

  // group checklist by section
  const grouped = (checklist || []).reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    const key = item.section || "General";
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {});

  return (
    <>
      <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-sites">
        <ArrowLeft className="h-4 w-4" /> All sites
      </Link>

      <PageHeader
        title={site.name}
        description={site.address || undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(`/sites/${siteId}/edit`)} data-testid="button-edit-site">
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
            <Button
              onClick={() => startInspection.mutate()}
              disabled={startInspection.isPending || (checklist?.length ?? 0) === 0}
              data-testid="button-start-inspection"
            >
              <Play className="mr-2 h-4 w-4" /> Start inspection
            </Button>
          </>
        }
      />

      {/* Site info */}
      <Card className="mb-6">
        <CardContent className="grid grid-cols-1 gap-y-3 gap-x-8 p-5 sm:grid-cols-2">
          {site.address && (
            <Info icon={MapPin} label="Address" value={site.address} />
          )}
          {site.clientName && <Info icon={User} label="Client contact" value={site.clientName} />}
          {site.clientPhone && <Info icon={Phone} label="Phone" value={site.clientPhone} />}
          {site.clientEmail && <Info icon={Mail} label="Email" value={site.clientEmail} />}
          {site.notes && (
            <div className="sm:col-span-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
              <p className="mt-0.5 whitespace-pre-wrap text-sm">{site.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="checklist">
        <TabsList>
          <TabsTrigger value="checklist" data-testid="tab-checklist">Checklist</TabsTrigger>
          <TabsTrigger value="inspections" data-testid="tab-inspections">Inspections</TabsTrigger>
          <TabsTrigger value="issues" data-testid="tab-issues">
            Open issues {siteIssues.length > 0 && `(${siteIssues.length})`}
          </TabsTrigger>
        </TabsList>

        {/* Checklist builder */}
        <TabsContent value="checklist" className="mt-4">
          <div className="mb-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={openNewItem} data-testid="button-add-checklist-item">
              <Plus className="mr-2 h-4 w-4" /> Add item
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDupOpen(true)} data-testid="button-duplicate-checklist">
              <Copy className="mr-2 h-4 w-4" /> Duplicate from another site
            </Button>
          </div>

          {clLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (checklist?.length ?? 0) === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-12 text-center">
                <ClipboardList className="mb-3 h-7 w-7 text-primary" />
                <p className="font-serif text-base font-semibold">No checklist items yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Add items to define what gets inspected at this site.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-5">
              {Object.entries(grouped).map(([section, items]) => (
                <div key={section}>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section}</h3>
                  <Card>
                    <CardContent className="divide-y p-0">
                      {items.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 px-4 py-3" data-testid={`row-checklist-${item.id}`}>
                          <div className="flex flex-col">
                            <button onClick={() => moveItem.mutate({ id: item.id, direction: "up" })} className="text-muted-foreground hover:text-foreground" data-testid={`button-move-up-${item.id}`}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => moveItem.mutate({ id: item.id, direction: "down" })} className="text-muted-foreground hover:text-foreground" data-testid={`button-move-down-${item.id}`}>
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{item.label}</p>
                          </div>
                          {item.requiresPhoto && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Photo required">
                              <Camera className="h-3.5 w-3.5" /> required
                            </span>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditItem(item)} data-testid={`button-edit-item-${item.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteItem.mutate(item.id)} data-testid={`button-delete-item-${item.id}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Inspections */}
        <TabsContent value="inspections" className="mt-4">
          {(inspections?.length ?? 0) === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No inspections recorded yet.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="divide-y p-0">
                {inspections!.map((insp) => {
                  const targetHref = insp.status === "draft"
                    ? `/sites/${siteId}/inspect/${insp.id}`
                    : `/inspections/${insp.id}`;
                  const goToInspection = () => navigate(targetHref);
                  return (
                    <div
                      key={insp.id}
                      role="button"
                      tabIndex={0}
                      onClick={goToInspection}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goToInspection(); } }}
                      className="flex items-center gap-3 px-4 py-3.5 hover-elevate cursor-pointer"
                      data-testid={`row-inspection-${insp.id}`}
                    >
                      <FileText className="h-5 w-5 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {insp.status === "submitted" ? "Inspection" : "Draft"} ·{" "}
                          {format(new Date(insp.submittedAt || insp.startedAt), "d MMM yyyy, h:mm a")}
                        </p>
                        <p className="text-xs text-muted-foreground">{insp.inspectorName}</p>
                      </div>
                      {insp.status === "draft" ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">Draft</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Submitted</span>
                      )}
                      {insp.status === "draft" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteInspectionId(insp.id); }}
                          data-testid={`button-delete-draft-${insp.id}`}
                          aria-label="Delete draft"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Issues */}
        <TabsContent value="issues" className="mt-4">
          {siteIssues.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                No open issues at this site.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {siteIssues.map((issue) => (
                <Link key={issue.id} href={`/issues/${issue.id}`} data-testid={`row-site-issue-${issue.id}`}>
                  <Card className="cursor-pointer hover-elevate">
                    <CardContent className="flex items-center gap-3 p-4">
                      <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{issue.label}</p>
                        <p className="text-xs text-muted-foreground">{issue.ageDays}d old</p>
                      </div>
                      <SeverityBadge severity={issue.severity} />
                      <IssueStatusBadge status={issue.status} />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="mt-10 border-t pt-6">
        <Button variant="ghost" className="text-destructive" onClick={() => setDeleteSiteOpen(true)} data-testid="button-delete-site">
          <Trash2 className="mr-2 h-4 w-4" /> Delete site
        </Button>
      </div>

      {/* Item dialog */}
      <Dialog open={itemDialog.open} onOpenChange={(o) => setItemDialog({ open: o })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">{itemDialog.edit ? "Edit item" : "Add checklist item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (itemForm.label.trim()) saveItem.mutate(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="label">Item label *</Label>
              <Input id="label" value={itemForm.label} onChange={(e) => setItemForm((f) => ({ ...f, label: e.target.value }))} data-testid="input-item-label" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="section">Section / category (optional)</Label>
              <SectionPicker
                key={itemDialog.open ? (itemDialog.edit?.id || "new") : "closed"}
                value={itemForm.section}
                onChange={(v) => setItemForm((f) => ({ ...f, section: v }))}
                options={Array.from(new Set((checklist || []).map((c) => c.section).filter((s): s is string => !!s && s.trim().length > 0))).sort((a, b) => a.localeCompare(b))}
              />
            </div>
            <label className="flex items-center gap-2.5">
              <Checkbox checked={itemForm.requiresPhoto} onCheckedChange={(c) => setItemForm((f) => ({ ...f, requiresPhoto: !!c }))} data-testid="checkbox-requires-photo" />
              <span className="text-sm">Photo required for this item</span>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setItemDialog({ open: false })}>Cancel</Button>
              <Button type="submit" disabled={saveItem.isPending} data-testid="button-save-item">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Duplicate dialog */}
      <Dialog open={dupOpen} onOpenChange={setDupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Duplicate checklist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Copy all checklist items from another site into this one.</p>
            <Select value={dupFrom} onValueChange={setDupFrom}>
              <SelectTrigger data-testid="select-dup-site"><SelectValue placeholder="Select a site" /></SelectTrigger>
              <SelectContent>
                {(allSites || []).filter((s) => s.id !== siteId).map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDupOpen(false)}>Cancel</Button>
              <Button onClick={() => duplicate.mutate()} disabled={!dupFrom || duplicate.isPending} data-testid="button-confirm-duplicate">Copy items</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteInspectionId !== null} onOpenChange={(o) => { if (!o) setDeleteInspectionId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              The draft and any photos saved to it will be removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteInspectionId && deleteInspection.mutate(deleteInspectionId)}
              data-testid="button-confirm-delete-draft"
            >
              Delete draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteSiteOpen} onOpenChange={setDeleteSiteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this site?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {site.name}, its checklist, inspections and issues. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => deleteSite.mutate()} data-testid="button-confirm-delete-site">
              Delete site
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SectionPicker({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const NEW = "__new__";
  const isNew = value !== "" && !options.includes(value);
  const [mode, setMode] = useState<"select" | "new">(isNew ? "new" : "select");

  if (mode === "new" || options.length === 0) {
    return (
      <div className="flex gap-2">
        <Input
          id="section"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. Exterior, Fire Safety"
          data-testid="input-item-section"
          autoFocus={mode === "new"}
        />
        {options.length > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => { setMode("select"); onChange(""); }}
            data-testid="button-section-pick-existing"
          >
            Pick existing
          </Button>
        )}
      </div>
    );
  }

  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => {
        if (v === NEW) {
          setMode("new");
          onChange("");
        } else {
          onChange(v);
        }
      }}
    >
      <SelectTrigger data-testid="select-item-section">
        <SelectValue placeholder="Select a section" />
      </SelectTrigger>
      <SelectContent>
        {options.map((s) => (
          <SelectItem key={s} value={s}>{s}</SelectItem>
        ))}
        <SelectItem value={NEW}>+ Add new section</SelectItem>
      </SelectContent>
    </Select>
  );
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}
