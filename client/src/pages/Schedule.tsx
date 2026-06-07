import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DueBadge } from "@/components/FrequencyPicker";
import { dueInfo } from "@/lib/due";
import { CalendarClock, MapPin, ChevronRight, CalendarCheck } from "lucide-react";
import type { Site } from "@shared/schema";

type SiteWithStats = Site & { checklistCount: number; inspectionCount: number; openIssues: number };

// Sites grouped by how soon their next inspection is due.
export default function Schedule() {
  const { data: sites, isLoading } = useQuery<SiteWithStats[]>({ queryKey: ["/api/sites"] });

  const scheduled = (sites || []).filter((s) => s.nextDueDate);
  const overdue = scheduled.filter((s) => dueInfo(s.nextDueDate).tone === "overdue");
  const soon = scheduled.filter((s) => dueInfo(s.nextDueDate).tone === "soon");
  const upcoming = scheduled.filter((s) => dueInfo(s.nextDueDate).tone === "upcoming");
  const byDate = (a: SiteWithStats, b: SiteWithStats) =>
    (a.nextDueDate || "").localeCompare(b.nextDueDate || "");

  return (
    <>
      <PageHeader title="Schedule" description="Upcoming and overdue inspections by site" />

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : scheduled.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <CalendarCheck className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-serif text-lg font-semibold">No scheduled inspections</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Set an inspection frequency on a site to see it here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <Group title="Overdue" sites={[...overdue].sort(byDate)} />
          <Group title="Due this week" sites={[...soon].sort(byDate)} />
          <Group title="Upcoming" sites={[...upcoming].sort(byDate)} />
        </div>
      )}
    </>
  );
}

function Group({ title, sites }: { title: string; sites: SiteWithStats[] }) {
  if (sites.length === 0) return null;
  return (
    <div>
      <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" /> {title} ({sites.length})
      </h2>
      <div className="space-y-3">
        {sites.map((site) => (
          <Link key={site.id} href={`/sites/${site.id}`} data-testid={`schedule-site-${site.id}`}>
            <Card className="cursor-pointer hover-elevate">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-serif text-base font-semibold">{site.name}</p>
                  {site.address && (
                    <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 flex-shrink-0" /> {site.address}
                    </p>
                  )}
                </div>
                <DueBadge nextDueDate={site.nextDueDate} />
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
