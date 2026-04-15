import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { useAuthFetch } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Target, FileText, FolderKanban, CheckSquare, LifeBuoy,
  RefreshCw, Copy, Unplug, Wifi, WifiOff, Database, Search, AlertCircle
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CrmConnection {
  id: number;
  name: string;
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

interface CrmDashboard {
  customers: { total: number; active: number };
  leads: { total: number; qualified: number; new: number };
  revenue: { total: number; paid: number; unpaid: number; overdue: number };
  projects: { total: number; active: number; onHold: number };
  tasks: { total: number; open: number; overdue: number };
  tickets: { total: number; open: number; closed: number };
}

interface CrmCustomer {
  id: number;
  company: string;
  email: string;
  phone: string;
  status: string;
  totalInvoiced: number;
}

interface CrmLead {
  id: number;
  name: string;
  company: string;
  email: string;
  status: string;
  source: string;
  value: number;
}

interface CrmInvoice {
  id: number;
  number: string;
  customer: string;
  date: string;
  dueDate: string;
  total: number;
  status: string;
}

interface CrmProject {
  id: number;
  name: string;
  customer: string;
  status: string;
  deadline: string | null;
  progress: number;
}

interface CrmTask {
  id: number;
  name: string;
  project: string;
  assignedTo: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

interface CrmTicket {
  id: number;
  subject: string;
  customer: string;
  status: string;
  priority: string;
  department: string;
  lastReply: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  const s = status?.toLowerCase();
  if (["active", "paid", "completed", "closed_won", "resolved", "done"].includes(s))
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  if (["overdue", "closed_lost", "cancelled", "lost"].includes(s))
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  if (["unpaid", "pending", "new", "open", "not_started"].includes(s))
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  if (["in_progress", "qualified", "contacted"].includes(s))
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  return "bg-secondary text-secondary-foreground";
}

function priorityColor(priority: string): string {
  const p = priority?.toLowerCase();
  if (["urgent", "critical", "high"].includes(p))
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  if (["medium"].includes(p))
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  return "bg-secondary text-secondary-foreground";
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function TableSkeleton({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: cols }).map((_, i) => (
            <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, r) => (
          <TableRow key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <TableCell key={c}><Skeleton className="h-4 w-full" /></TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminCrmPage() {
  const { locale, dir } = useI18n();
  const { toast } = useToast();
  const qc = useQueryClient();
  const authFetch = useAuthFetch();
  const isRtl = dir === "rtl";
  const en = locale === "en";

  // Connection setup state
  const [setupName, setSetupName] = useState("PerfexCRM");
  const [setupUrl, setSetupUrl] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [activeTab, setActiveTab] = useState("customers");
  const [customerSearch, setCustomerSearch] = useState("");
  const [leadSearch, setLeadSearch] = useState("");

  // ── Fetch connection ──
  const { data: connection, isLoading: connLoading } = useQuery<CrmConnection | null>({
    queryKey: ["/api/admin/crm/connection"],
    queryFn: () =>
      authFetch("GET", "/api/admin/crm/connection")
        .then((r) => r.json())
        .catch(() => null),
  });

  const connectionId = connection?.id;

  // ── Fetch dashboard stats ──
  const { data: dashboard, isLoading: dashLoading } = useQuery<CrmDashboard>({
    queryKey: ["/api/admin/crm", connectionId, "dashboard"],
    queryFn: () =>
      authFetch("GET", `/api/admin/crm/${connectionId}/dashboard`).then((r) => r.json()),
    enabled: !!connectionId,
  });

  // ── Fetch tab data ──
  const { data: customers = [], isLoading: custLoading } = useQuery<CrmCustomer[]>({
    queryKey: ["/api/admin/crm", connectionId, "customers"],
    queryFn: () =>
      authFetch("GET", `/api/admin/crm/${connectionId}/customers`).then((r) => r.json()),
    enabled: !!connectionId && activeTab === "customers",
  });

  const { data: leads = [], isLoading: leadsLoading } = useQuery<CrmLead[]>({
    queryKey: ["/api/admin/crm", connectionId, "leads"],
    queryFn: () =>
      authFetch("GET", `/api/admin/crm/${connectionId}/leads`).then((r) => r.json()),
    enabled: !!connectionId && activeTab === "leads",
  });

  const { data: invoices = [], isLoading: invLoading } = useQuery<CrmInvoice[]>({
    queryKey: ["/api/admin/crm", connectionId, "invoices"],
    queryFn: () =>
      authFetch("GET", `/api/admin/crm/${connectionId}/invoices`).then((r) => r.json()),
    enabled: !!connectionId && activeTab === "invoices",
  });

  const { data: projects = [], isLoading: projLoading } = useQuery<CrmProject[]>({
    queryKey: ["/api/admin/crm", connectionId, "projects"],
    queryFn: () =>
      authFetch("GET", `/api/admin/crm/${connectionId}/projects`).then((r) => r.json()),
    enabled: !!connectionId && activeTab === "projects",
  });

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<CrmTask[]>({
    queryKey: ["/api/admin/crm", connectionId, "tasks"],
    queryFn: () =>
      authFetch("GET", `/api/admin/crm/${connectionId}/tasks`).then((r) => r.json()),
    enabled: !!connectionId && activeTab === "tasks",
  });

  const { data: tickets = [], isLoading: ticketsLoading } = useQuery<CrmTicket[]>({
    queryKey: ["/api/admin/crm", connectionId, "tickets"],
    queryFn: () =>
      authFetch("GET", `/api/admin/crm/${connectionId}/tickets`).then((r) => r.json()),
    enabled: !!connectionId && activeTab === "tickets",
  });

  // ── Mutations ──
  const connectMutation = useMutation({
    mutationFn: () =>
      authFetch("POST", "/api/admin/crm/connect", {
        name: setupName,
        crmUrl: setupUrl,
        apiKey: setupKey,
      }).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: en ? "CRM connected" : "CRM חובר" });
      qc.invalidateQueries({ queryKey: ["/api/admin/crm/connection"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () =>
      authFetch("DELETE", `/api/admin/crm/${connectionId}/disconnect`).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: en ? "CRM disconnected" : "CRM נותק" });
      qc.invalidateQueries({ queryKey: ["/api/admin/crm/connection"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const syncMutation = useMutation({
    mutationFn: () =>
      authFetch("POST", `/api/admin/crm/${connectionId}/sync`).then((r) => r.json()),
    onSuccess: () => {
      toast({ title: en ? "Sync started" : "סנכרון החל" });
      qc.invalidateQueries({ queryKey: ["/api/admin/crm", connectionId, "dashboard"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const copyWebhook = () => {
    if (connection?.webhookSecret) {
      navigator.clipboard.writeText(connection.webhookSecret);
      toast({ title: en ? "Copied to clipboard" : "הועתק ללוח" });
    }
  };

  // ── Filtered data ──
  const filteredCustomers = customers.filter(
    (c) =>
      !customerSearch ||
      c.company?.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.email?.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const filteredLeads = leads.filter(
    (l) =>
      !leadSearch ||
      l.name?.toLowerCase().includes(leadSearch.toLowerCase()) ||
      l.company?.toLowerCase().includes(leadSearch.toLowerCase()) ||
      l.email?.toLowerCase().includes(leadSearch.toLowerCase())
  );

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto" dir={dir}>
      {/* ── Header ── */}
      <div className={`flex items-center justify-between ${isRtl ? "flex-row-reverse" : ""}`}>
        <div className={isRtl ? "text-right" : ""}>
          <h1 className="text-xl font-bold">{en ? "CRM Integration" : "אינטגרציית CRM"}</h1>
          <p className="text-sm text-muted-foreground">
            {en ? "Manage your PerfexCRM connection and data" : "נהל את חיבור ה-PerfexCRM והנתונים שלך"}
          </p>
        </div>
        {connection && (
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            data-testid="button-sync-now"
          >
            <RefreshCw className={`w-4 h-4 ${isRtl ? "ml-1" : "mr-1"} ${syncMutation.isPending ? "animate-spin" : ""}`} />
            {en ? "Sync Now" : "סנכרן עכשיו"}
          </Button>
        )}
      </div>

      {/* ── Connection Card ── */}
      {connLoading ? (
        <Card><CardContent className="p-6"><Skeleton className="h-24 w-full" /></CardContent></Card>
      ) : !connection ? (
        /* Setup form */
        <Card>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 text-base ${isRtl ? "flex-row-reverse" : ""}`}>
              <Database className="w-4 h-4" />
              {en ? "Connect PerfexCRM" : "חבר PerfexCRM"}
            </CardTitle>
            <CardDescription>
              {en
                ? "Enter your PerfexCRM URL and API key to start syncing data."
                : "הזן את כתובת ה-PerfexCRM ומפתח ה-API כדי להתחיל לסנכרן נתונים."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>{en ? "Connection Name" : "שם חיבור"}</Label>
                <Input
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  placeholder="PerfexCRM"
                  data-testid="input-crm-name"
                />
              </div>
              <div className="space-y-1">
                <Label>{en ? "CRM URL" : "כתובת CRM"}</Label>
                <Input
                  value={setupUrl}
                  onChange={(e) => setSetupUrl(e.target.value)}
                  placeholder="https://massive-group.io/crm"
                  data-testid="input-crm-url"
                />
              </div>
              <div className="space-y-1">
                <Label>{en ? "API Key" : "מפתח API"}</Label>
                <Input
                  type="password"
                  value={setupKey}
                  onChange={(e) => setSetupKey(e.target.value)}
                  placeholder="••••••••••••••••"
                  data-testid="input-crm-apikey"
                />
              </div>
            </div>
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={!setupUrl.trim() || !setupKey.trim() || connectMutation.isPending}
              data-testid="button-connect-crm"
            >
              <Wifi className={`w-4 h-4 ${isRtl ? "ml-1" : "mr-1"}`} />
              {connectMutation.isPending ? (en ? "Connecting..." : "מתחבר...") : (en ? "Connect" : "התחבר")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Connected status */
        <Card className="border-green-500/30">
          <CardContent className="p-4">
            <div className={`flex flex-wrap items-center gap-4 ${isRtl ? "flex-row-reverse" : ""}`}>
              {/* Status */}
              <div className={`flex items-center gap-2 ${isRtl ? "flex-row-reverse" : ""}`}>
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-0">
                  {en ? "Connected" : "מחובר"}
                </Badge>
                <span className="font-medium">{connection.name}</span>
              </div>

              {/* URL */}
              <span className="text-sm text-muted-foreground font-mono">{connection.apiUrl}</span>

              {/* Last sync */}
              {connection.lastSyncAt && (
                <span className="text-xs text-muted-foreground">
                  {en ? "Last sync:" : "סנכרון אחרון:"}{" "}
                  {new Date(connection.lastSyncAt).toLocaleString()}
                </span>
              )}

              <div className={`flex items-center gap-2 ${isRtl ? "mr-auto" : "ml-auto"}`}>
                {/* Webhook secret */}
                <div className={`flex items-center gap-1.5 ${isRtl ? "flex-row-reverse" : ""}`}>
                  <span className="text-xs text-muted-foreground">{en ? "Webhook Secret:" : "מפתח Webhook:"}</span>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono max-w-[120px] truncate">
                    {connection.webhookSecret}
                  </code>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={copyWebhook} data-testid="button-copy-webhook">
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>

                <Separator orientation="vertical" className="h-5" />

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  data-testid="button-disconnect-crm"
                >
                  <WifiOff className={`w-3 h-3 ${isRtl ? "ml-1" : "mr-1"}`} />
                  {en ? "Disconnect" : "נתק"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── KPI Stats ── */}
      {connection && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Customers */}
          <Card data-testid="kpi-customers">
            <CardContent className="p-4 space-y-1">
              <div className={`flex items-center gap-1.5 text-muted-foreground ${isRtl ? "flex-row-reverse" : ""}`}>
                <Users className="w-3.5 h-3.5" />
                <span className="text-xs">{en ? "Customers" : "לקוחות"}</span>
              </div>
              {dashLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{dashboard?.customers?.total ?? 0}</div>
                  <div className="text-xs text-muted-foreground">
                    {dashboard?.customers?.active ?? 0} {en ? "active" : "פעילים"}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Leads */}
          <Card data-testid="kpi-leads">
            <CardContent className="p-4 space-y-1">
              <div className={`flex items-center gap-1.5 text-muted-foreground ${isRtl ? "flex-row-reverse" : ""}`}>
                <Target className="w-3.5 h-3.5" />
                <span className="text-xs">{en ? "Leads" : "לידים"}</span>
              </div>
              {dashLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{dashboard?.leads?.total ?? 0}</div>
                  <div className="text-xs text-muted-foreground">
                    {dashboard?.leads?.qualified ?? 0} {en ? "qualified" : "מוסמכים"}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Revenue */}
          <Card data-testid="kpi-revenue">
            <CardContent className="p-4 space-y-1">
              <div className={`flex items-center gap-1.5 text-muted-foreground ${isRtl ? "flex-row-reverse" : ""}`}>
                <FileText className="w-3.5 h-3.5" />
                <span className="text-xs">{en ? "Revenue" : "הכנסות"}</span>
              </div>
              {dashLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <>
                  <div className="text-lg font-bold">{fmt(dashboard?.invoices?.totalValue ?? 0)}</div>
                  <div className="text-xs text-red-600 dark:text-red-400">
                    {fmt(dashboard?.invoices?.overdueValue ?? 0)} {en ? "overdue" : "באיחור"}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Projects */}
          <Card data-testid="kpi-projects">
            <CardContent className="p-4 space-y-1">
              <div className={`flex items-center gap-1.5 text-muted-foreground ${isRtl ? "flex-row-reverse" : ""}`}>
                <FolderKanban className="w-3.5 h-3.5" />
                <span className="text-xs">{en ? "Projects" : "פרויקטים"}</span>
              </div>
              {dashLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{dashboard?.projects?.active ?? 0}</div>
                  <div className="text-xs text-muted-foreground">
                    {dashboard?.projects?.onHold ?? 0} {en ? "on hold" : "בהמתנה"}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card data-testid="kpi-tasks">
            <CardContent className="p-4 space-y-1">
              <div className={`flex items-center gap-1.5 text-muted-foreground ${isRtl ? "flex-row-reverse" : ""}`}>
                <CheckSquare className="w-3.5 h-3.5" />
                <span className="text-xs">{en ? "Open Tasks" : "משימות פתוחות"}</span>
              </div>
              {dashLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{dashboard?.tasks?.open ?? 0}</div>
                  <div className="text-xs text-red-600 dark:text-red-400">
                    {dashboard?.tasks?.overdue ?? 0} {en ? "overdue" : "באיחור"}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Tickets */}
          <Card data-testid="kpi-tickets">
            <CardContent className="p-4 space-y-1">
              <div className={`flex items-center gap-1.5 text-muted-foreground ${isRtl ? "flex-row-reverse" : ""}`}>
                <LifeBuoy className="w-3.5 h-3.5" />
                <span className="text-xs">{en ? "Open Tickets" : "פניות פתוחות"}</span>
              </div>
              {dashLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{dashboard?.tickets?.open ?? 0}</div>
                  <div className="text-xs text-muted-foreground">
                    {dashboard?.tickets?.total ?? 0} {en ? "total" : "סה״כ"}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Tabbed Data View ── */}
      {connection ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1" data-testid="crm-tabs">
            <TabsTrigger value="customers" data-testid="tab-customers">
              <Users className="w-3.5 h-3.5 mr-1" />
              {en ? "Customers" : "לקוחות"}
            </TabsTrigger>
            <TabsTrigger value="leads" data-testid="tab-leads">
              <Target className="w-3.5 h-3.5 mr-1" />
              {en ? "Leads" : "לידים"}
            </TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices">
              <FileText className="w-3.5 h-3.5 mr-1" />
              {en ? "Invoices" : "חשבוניות"}
            </TabsTrigger>
            <TabsTrigger value="projects" data-testid="tab-projects">
              <FolderKanban className="w-3.5 h-3.5 mr-1" />
              {en ? "Projects" : "פרויקטים"}
            </TabsTrigger>
            <TabsTrigger value="tasks" data-testid="tab-tasks">
              <CheckSquare className="w-3.5 h-3.5 mr-1" />
              {en ? "Tasks" : "משימות"}
            </TabsTrigger>
            <TabsTrigger value="tickets" data-testid="tab-tickets">
              <LifeBuoy className="w-3.5 h-3.5 mr-1" />
              {en ? "Tickets" : "פניות"}
            </TabsTrigger>
          </TabsList>

          {/* ── Customers ── */}
          <TabsContent value="customers">
            <Card>
              <CardHeader className="pb-3">
                <div className={`flex items-center gap-3 ${isRtl ? "flex-row-reverse" : ""}`}>
                  <div className="relative flex-1 max-w-xs">
                    <Search className={`absolute top-2.5 ${isRtl ? "right-2.5" : "left-2.5"} w-4 h-4 text-muted-foreground`} />
                    <Input
                      className={isRtl ? "pr-8" : "pl-8"}
                      placeholder={en ? "Search customers..." : "חפש לקוחות..."}
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      data-testid="input-search-customers"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {filteredCustomers.length} {en ? "results" : "תוצאות"}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {custLoading ? (
                  <TableSkeleton cols={5} />
                ) : filteredCustomers.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-sm">{en ? "No customers found." : "לא נמצאו לקוחות."}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{en ? "Company" : "חברה"}</TableHead>
                          <TableHead>{en ? "Email" : "אימייל"}</TableHead>
                          <TableHead>{en ? "Phone" : "טלפון"}</TableHead>
                          <TableHead>{en ? "Status" : "סטטוס"}</TableHead>
                          <TableHead className="text-right">{en ? "Total Invoiced" : "סה״כ חויב"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCustomers.map((c) => (
                          <TableRow key={c.id} data-testid={`row-customer-${c.id}`}>
                            <TableCell className="font-medium">{c.company}</TableCell>
                            <TableCell className="text-muted-foreground">{c.email}</TableCell>
                            <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(c.status)}`}>
                                {c.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {fmt(c.totalInvoiced)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Leads ── */}
          <TabsContent value="leads">
            <Card>
              <CardHeader className="pb-3">
                <div className={`flex items-center gap-3 ${isRtl ? "flex-row-reverse" : ""}`}>
                  <div className="relative flex-1 max-w-xs">
                    <Search className={`absolute top-2.5 ${isRtl ? "right-2.5" : "left-2.5"} w-4 h-4 text-muted-foreground`} />
                    <Input
                      className={isRtl ? "pr-8" : "pl-8"}
                      placeholder={en ? "Search leads..." : "חפש לידים..."}
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      data-testid="input-search-leads"
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {filteredLeads.length} {en ? "results" : "תוצאות"}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {leadsLoading ? (
                  <TableSkeleton cols={6} />
                ) : filteredLeads.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-sm">{en ? "No leads found." : "לא נמצאו לידים."}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{en ? "Name" : "שם"}</TableHead>
                          <TableHead>{en ? "Company" : "חברה"}</TableHead>
                          <TableHead>{en ? "Email" : "אימייל"}</TableHead>
                          <TableHead>{en ? "Status" : "סטטוס"}</TableHead>
                          <TableHead>{en ? "Source" : "מקור"}</TableHead>
                          <TableHead className="text-right">{en ? "Value" : "ערך"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLeads.map((l) => (
                          <TableRow key={l.id} data-testid={`row-lead-${l.id}`}>
                            <TableCell className="font-medium">{l.name}</TableCell>
                            <TableCell className="text-muted-foreground">{l.company || "—"}</TableCell>
                            <TableCell className="text-muted-foreground">{l.email}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(l.status)}`}>
                                {l.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{l.source || "—"}</TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {l.value ? fmt(l.value) : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Invoices ── */}
          <TabsContent value="invoices">
            <Card>
              <CardContent className="pt-4">
                {invLoading ? (
                  <TableSkeleton cols={6} />
                ) : invoices.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-sm">{en ? "No invoices found." : "לא נמצאו חשבוניות."}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{en ? "Number" : "מספר"}</TableHead>
                          <TableHead>{en ? "Customer" : "לקוח"}</TableHead>
                          <TableHead>{en ? "Date" : "תאריך"}</TableHead>
                          <TableHead>{en ? "Due Date" : "תאריך פירעון"}</TableHead>
                          <TableHead className="text-right">{en ? "Total" : "סכום"}</TableHead>
                          <TableHead>{en ? "Status" : "סטטוס"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((inv) => (
                          <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                            <TableCell className="font-mono text-sm font-medium">{inv.number}</TableCell>
                            <TableCell>{inv.customer}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{fmtDate(inv.date)}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{fmtDate(inv.dueDate)}</TableCell>
                            <TableCell className="text-right font-mono text-sm">{fmt(inv.total)}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(inv.status)}`}>
                                {inv.status === "paid" ? (en ? "Paid" : "שולם")
                                  : inv.status === "overdue" ? (en ? "Overdue" : "באיחור")
                                  : en ? "Unpaid" : "לא שולם"}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Projects ── */}
          <TabsContent value="projects">
            <Card>
              <CardContent className="pt-4">
                {projLoading ? (
                  <TableSkeleton cols={5} />
                ) : projects.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-sm">{en ? "No projects found." : "לא נמצאו פרויקטים."}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{en ? "Name" : "שם"}</TableHead>
                          <TableHead>{en ? "Customer" : "לקוח"}</TableHead>
                          <TableHead>{en ? "Status" : "סטטוס"}</TableHead>
                          <TableHead>{en ? "Deadline" : "דדליין"}</TableHead>
                          <TableHead className="min-w-[120px]">{en ? "Progress" : "התקדמות"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {projects.map((p) => (
                          <TableRow key={p.id} data-testid={`row-project-${p.id}`}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="text-muted-foreground">{p.customer}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(p.status)}`}>
                                {p.status}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{fmtDate(p.deadline)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Progress value={p.progress} className="h-1.5 flex-1" />
                                <span className="text-xs text-muted-foreground w-8 shrink-0">
                                  {p.progress}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tasks ── */}
          <TabsContent value="tasks">
            <Card>
              <CardContent className="pt-4">
                {tasksLoading ? (
                  <TableSkeleton cols={6} />
                ) : tasks.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-sm">{en ? "No tasks found." : "לא נמצאו משימות."}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{en ? "Name" : "שם"}</TableHead>
                          <TableHead>{en ? "Project" : "פרויקט"}</TableHead>
                          <TableHead>{en ? "Assigned To" : "מוקצה ל"}</TableHead>
                          <TableHead>{en ? "Status" : "סטטוס"}</TableHead>
                          <TableHead>{en ? "Priority" : "עדיפות"}</TableHead>
                          <TableHead>{en ? "Due Date" : "תאריך יעד"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tasks.map((t) => (
                          <TableRow key={t.id} data-testid={`row-task-${t.id}`}>
                            <TableCell className="font-medium">{t.name}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{t.project || "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{t.assignedTo || "—"}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(t.status)}`}>
                                {t.status}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${priorityColor(t.priority)}`}>
                                {t.priority}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{fmtDate(t.dueDate)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Tickets ── */}
          <TabsContent value="tickets">
            <Card>
              <CardContent className="pt-4">
                {ticketsLoading ? (
                  <TableSkeleton cols={6} />
                ) : tickets.length === 0 ? (
                  <div className="flex flex-col items-center py-10 text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mb-2 opacity-40" />
                    <p className="text-sm">{en ? "No tickets found." : "לא נמצאו פניות."}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{en ? "Subject" : "נושא"}</TableHead>
                          <TableHead>{en ? "Customer" : "לקוח"}</TableHead>
                          <TableHead>{en ? "Status" : "סטטוס"}</TableHead>
                          <TableHead>{en ? "Priority" : "עדיפות"}</TableHead>
                          <TableHead>{en ? "Department" : "מחלקה"}</TableHead>
                          <TableHead>{en ? "Last Reply" : "תגובה אחרונה"}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tickets.map((tk) => (
                          <TableRow key={tk.id} data-testid={`row-ticket-${tk.id}`}>
                            <TableCell className="font-medium max-w-[200px] truncate">{tk.subject}</TableCell>
                            <TableCell className="text-muted-foreground">{tk.customer}</TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(tk.status)}`}>
                                {tk.status}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${priorityColor(tk.priority)}`}>
                                {tk.priority}
                              </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{tk.department || "—"}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{fmtDate(tk.lastReply)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        !connLoading && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Database className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">
                {en
                  ? "Connect your PerfexCRM instance above to view data."
                  : "חבר את מופע ה-PerfexCRM שלך למעלה כדי לצפות בנתונים."}
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
