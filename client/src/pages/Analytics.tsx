import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, downloadFile } from "@/lib/queryClient";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Clock, ClipboardCheck, AlertTriangle, Download } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line,
} from "recharts";

interface Analytics {
  cards: { totalOpen: number; urgentOpen: number; avgDaysToResolve: number; inspectionsThisMonth: number };
  topFailingItems: { label: string; count: number }[];
  sitesByUrgent: { name: string; count: number }[];
  resolvedOverTime: { week: string; count: number }[];
}

const NAVY = "#090b38";
const RED = "#dc2626";

export default function Analytics() {
  const [range, setRange] = useState("90");
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Analytics>({
    queryKey: ["/api/analytics", `range=${range}`],
    queryFn: async () => (await apiRequest("GET", `/api/analytics?range=${range}`)).json(),
  });

  async function exportPortfolio() {
    try {
      await downloadFile("/api/export/portfolio.xlsx", "fortis-fm-portfolio.xlsx");
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Portfolio health and inspection trends"
        actions={
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-36" data-testid="select-analytics-range"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 12 months</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportPortfolio} data-testid="button-export-portfolio">
              <Download className="mr-2 h-4 w-4" /> Portfolio
            </Button>
          </div>
        }
      />

      {isLoading || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat icon={AlertCircle} label="Open issues" value={data.cards.totalOpen} />
            <Stat icon={AlertTriangle} label="Urgent open" value={data.cards.urgentOpen} tone="red" />
            <Stat icon={Clock} label="Avg days to resolve" value={data.cards.avgDaysToResolve} />
            <Stat icon={ClipboardCheck} label="Inspections this month" value={data.cards.inspectionsThisMonth} />
          </div>

          <ChartCard title="Top failing checklist items">
            {data.topFailingItems.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.topFailingItems} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11 }} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="count" fill={NAVY} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Sites by open urgent issues">
              {data.sitesByUrgent.length === 0 ? (
                <Empty />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.sitesByUrgent} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip cursor={{ fill: "#f1f5f9" }} />
                    <Bar dataKey="count" fill={RED} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Issues resolved (last 12 weeks)">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={data.resolvedOverTime} margin={{ left: 0, right: 8 }}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke={NAVY} strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: any; label: string; value: number; tone?: "red" }) {
  return (
    <Card data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className={tone === "red" ? "h-4 w-4 text-red-600" : "h-4 w-4"} />
          <span className="text-xs">{label}</span>
        </div>
        <p className={tone === "red" && value > 0 ? "mt-2 text-2xl font-semibold text-red-600" : "mt-2 text-2xl font-semibold"}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-5">
        <h3 className="mb-4 text-sm font-semibold">{title}</h3>
        {children}
      </CardContent>
    </Card>
  );
}

function Empty() {
  return <p className="py-12 text-center text-sm text-muted-foreground">No data for this range yet.</p>;
}
