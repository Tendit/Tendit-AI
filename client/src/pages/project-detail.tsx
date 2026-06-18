import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { useAuthFetch } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, MoreVertical, Users, Calendar, MessageSquare, LayoutDashboard,
  Plus, CheckSquare, Clock, AlertCircle, CheckCircle2, Circle,
  Send, Pencil, Trash2, UserPlus, MoreHorizontal, RefreshCw, Bot, GitBranch, Zap
} from "lucide-react";
import ProjectArmsTab from "@/pages/project-arms";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Project {
  id: number;
  name: string;
  description: string | null;
  ownerId: number;
  status: string;
  priority: string;
  startDate: string | null;
  deadline: string | null;
  color: string | null;
  agentId: number | null;
  createdAt: string;
  updatedAt: string;
  members?: ProjectMemberWithUser[];
  counts?: { assignments: number; messages: number };
}

interface ProjectMemberWithUser {
  id: number;
  projectId: number;
  userId: number;
  role: string;
  addedAt: string;
  user: { id: number; username: string; email: string };
}

interface ProjectAssignment {
  id: number;
  projectId: number;
  assignedTo: number;
  createdBy: number;
  title: string;
  description: string | null;
  type: string;
  dueAt: string | null;
  cronExpression: string | null;
  status: string;
  priority: string;
  reminderMinutes: number | null;
  completedAt: string | null;
  createdAt: string;
}

interface ProjectMessage {
  id: number;
  projectId: number;
  userId: number | null;
  role: string;
  content: string;
  mentionsUserIds: string | null;
  source: string;
  createdAt: string;
}

interface PlatformUser {
  id: number;
  username: string;
  email: string;
  role: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  planning: { label: "Planning", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  on_hold: { label: "On Hold", variant: "outline" },
  completed: { label: "Completed", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-muted-foreground",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
};

function formatDeadlineCountdown(deadline: string | null): string | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)} days overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "1 day left";
  return `${diff} days left`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const COLOR_PALETTE = [
  "#0d9488", "#2563eb", "#7c3aed", "#db2777", "#ea580c",
  "#65a30d", "#0891b2", "#b45309", "#4338ca", "#be185d",
];

function userColor(userId: number): string {
  return COLOR_PALETTE[userId % COLOR_PALETTE.length];
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ project, assignments, messages, members }: {
  project: Project;
  assignments: ProjectAssignment[];
  messages: ProjectMessage[];
  members: ProjectMemberWithUser[];
}) {
  const total = assignments.length;
  const completed = assignments.filter(a => a.status === "done").length;
  const overdue = assignments.filter(a => a.status === "overdue" || (a.dueAt && new Date(a.dueAt) < new Date() && a.status !== "done")).length;

  // Recent activity: last 8 messages + completed assignments, sorted by date
  const activity: { id: string; text: string; time: string; type: "message" | "completed" }[] = [
    ...messages.slice(-8).map(m => ({
      id: `msg-${m.id}`,
      text: m.content.slice(0, 80) + (m.content.length > 80 ? "…" : ""),
      time: m.createdAt,
      type: "message" as const,
    })),
    ...assignments.filter(a => a.completedAt).map(a => ({
      id: `asgn-${a.id}`,
      text: `"${a.title}" completed`,
      time: a.completedAt!,
      type: "completed" as const,
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 8);

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Tasks", value: total, icon: <CheckSquare className="w-4 h-4" /> },
          { label: "Completed", value: completed, icon: <CheckCircle2 className="w-4 h-4 text-green-600" /> },
          { label: "Overdue", value: overdue, icon: <AlertCircle className="w-4 h-4 text-destructive" /> },
          { label: "Members", value: members.length, icon: <Users className="w-4 h-4 text-primary" /> },
        ].map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
                {kpi.icon}
              </div>
              <div className="text-2xl font-bold mt-1">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Description */}
        {project.description && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">About</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Recent activity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="space-y-2.5">
                {activity.map(item => (
                  <div key={item.id} className="flex gap-2 items-start">
                    <div className="mt-0.5 shrink-0">
                      {item.type === "completed"
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        : <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs leading-snug">{item.text}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(item.time)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

function MembersTab({ projectId, members, isOwner }: {
  projectId: number;
  members: ProjectMemberWithUser[];
  isOwner: boolean;
}) {
  const { t, dir } = useI18n();
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<"existing" | "invite">("existing");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [addRole, setAddRole] = useState("contributor");
  const [isAdding, setIsAdding] = useState(false);

  // Admin users list for picker
  const { data: allUsers } = useQuery<PlatformUser[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await authFetch("GET", "/api/admin/users");
      return res.json();
    },
    enabled: showAdd && addMode === "existing",
  });

  const filteredUsers = (allUsers ?? []).filter(u =>
    !members.some(m => m.userId === u.id) &&
    (u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()))
  );

  async function handleAddMember() {
    setIsAdding(true);
    try {
      if (addMode === "existing") {
        if (!selectedUserId) { toast({ title: "Select a user", variant: "destructive" }); return; }
        await authFetch("POST", `/api/projects/${projectId}/members`, { userId: Number(selectedUserId), role: addRole });
        toast({ title: "Member added" });
      } else {
        if (!inviteEmail.trim()) { toast({ title: "Enter an email", variant: "destructive" }); return; }
        const res = await authFetch("POST", `/api/projects/${projectId}/members`, { email: inviteEmail.trim(), role: addRole });
        const data = await res.json().catch(() => ({}));
        const inviteLink = data?.inviteLink ?? data?.token
          ? `${window.location.origin}/#/invite/${data.token}`
          : null;
        toast({
          title: "Invite sent",
          description: inviteLink
            ? `Share this link manually: ${inviteLink}`
            : "Invite email queued.",
          duration: 10000,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setShowAdd(false);
      setSelectedUserId("");
      setInviteEmail("");
      setUserSearch("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRoleChange(userId: number, role: string) {
    try {
      await authFetch("PATCH", `/api/projects/${projectId}/members/${userId}`, { role });
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Role updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function handleRemove(userId: number) {
    if (!confirm("Remove this member from the project?")) return;
    try {
      await authFetch("DELETE", `/api/projects/${projectId}/members/${userId}`);
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      toast({ title: "Member removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className={`flex items-center justify-between ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
        <h3 className="text-sm font-semibold">{t("projects.members")}</h3>
        {isOwner && (
          <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(true)} data-testid="button-add-member">
            <UserPlus className="w-4 h-4" />
            {t("projects.addMember")}
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              {isOwner && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map(m => (
              <TableRow key={m.id} data-testid={`member-row-${m.userId}`}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="w-7 h-7">
                      <AvatarFallback
                        className="text-[10px] text-white"
                        style={{ backgroundColor: userColor(m.userId) }}
                      >
                        {getInitials(m.user?.username ?? "?")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{m.user?.username}</span>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{m.user?.email}</TableCell>
                <TableCell>
                  {isOwner && m.role !== "owner" ? (
                    <Select
                      value={m.role}
                      onValueChange={v => handleRoleChange(m.userId, v)}
                    >
                      <SelectTrigger
                        className="h-7 text-xs w-28"
                        data-testid={`select-role-${m.userId}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="contributor">Contributor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="text-xs capitalize">{m.role}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {new Date(m.addedAt).toLocaleDateString()}
                </TableCell>
                {isOwner && (
                  <TableCell className="text-right">
                    {m.role !== "owner" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => handleRemove(m.userId)}
                        data-testid={`button-remove-member-${m.userId}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Add Member Dialog */}
      <Dialog open={showAdd} onOpenChange={v => !v && setShowAdd(false)}>
        <DialogContent className="max-w-md" dir={dir}>
          <DialogHeader>
            <DialogTitle>{t("projects.addMember")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={addMode === "existing" ? "default" : "outline"}
                onClick={() => setAddMode("existing")}
                data-testid="button-mode-existing"
              >
                Existing User
              </Button>
              <Button
                size="sm"
                variant={addMode === "invite" ? "default" : "outline"}
                onClick={() => setAddMode("invite")}
                data-testid="button-mode-invite"
              >
                Invite by Email
              </Button>
            </div>

            {addMode === "existing" ? (
              <div className="space-y-2">
                <Label>Search Users</Label>
                <Input
                  placeholder="Search by name or email..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  data-testid="input-user-search"
                />
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  {filteredUsers.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-3 text-center">No users found</p>
                  ) : (
                    filteredUsers.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-center gap-2 ${selectedUserId === String(u.id) ? "bg-primary/10" : ""}`}
                        onClick={() => setSelectedUserId(String(u.id))}
                        data-testid={`user-option-${u.id}`}
                      >
                        <Avatar className="w-6 h-6 shrink-0">
                          <AvatarFallback className="text-[9px]" style={{ backgroundColor: userColor(u.id) }}>
                            {getInitials(u.username)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{u.username}</div>
                          <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="invite-email">Email Address</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  data-testid="input-invite-email"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={addRole} onValueChange={setAddRole}>
                <SelectTrigger data-testid="select-add-member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="contributor">Contributor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)} data-testid="button-cancel-add-member">Cancel</Button>
            <Button onClick={handleAddMember} disabled={isAdding} data-testid="button-confirm-add-member">
              {addMode === "invite" ? "Send Invite" : "Add Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Calendar Tab ─────────────────────────────────────────────────────────────

const CRON_PRESETS = [
  { label: "Every day 9am", value: "0 9 * * *" },
  { label: "Every weekday 9am", value: "0 9 * * 1-5" },
  { label: "Every Monday 9am", value: "0 9 * * 1" },
  { label: "Weekly (Sun 9am)", value: "0 9 * * 0" },
  { label: "Monthly (1st, 9am)", value: "0 9 1 * *" },
];

function CalendarTab({ projectId, assignments, members }: {
  projectId: number;
  assignments: ProjectAssignment[];
  members: ProjectMemberWithUser[];
}) {
  const { t, dir } = useI18n();
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showNew, setShowNew] = useState(false);
  const [editItem, setEditItem] = useState<ProjectAssignment | null>(null);
  const [form, setForm] = useState({
    title: "", description: "", assignedTo: "",
    type: "one_time", dueAt: "", cronExpression: "", priority: "medium", reminderMinutes: "30",
  });

  function resetForm() {
    setForm({ title: "", description: "", assignedTo: "", type: "one_time", dueAt: "", cronExpression: "", priority: "medium", reminderMinutes: "30" });
  }

  function openEdit(a: ProjectAssignment) {
    setEditItem(a);
    setForm({
      title: a.title,
      description: a.description ?? "",
      assignedTo: String(a.assignedTo),
      type: a.type,
      dueAt: a.dueAt ? a.dueAt.slice(0, 16) : "",
      cronExpression: a.cronExpression ?? "",
      priority: a.priority,
      reminderMinutes: String(a.reminderMinutes ?? 30),
    });
    setShowNew(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { toast({ title: "Title required", variant: "destructive" }); return; }
    try {
      const payload: Record<string, any> = {
        title: form.title.trim(),
        description: form.description || null,
        assignedTo: form.assignedTo ? Number(form.assignedTo) : undefined,
        type: form.type,
        dueAt: form.type === "one_time" && form.dueAt ? new Date(form.dueAt).toISOString() : null,
        cronExpression: form.type === "recurring" ? form.cronExpression : null,
        priority: form.priority,
        reminderMinutes: Number(form.reminderMinutes),
      };
      if (editItem) {
        await authFetch("PATCH", `/api/assignments/${editItem.id}`, payload);
        toast({ title: "Assignment updated" });
      } else {
        await authFetch("POST", `/api/projects/${projectId}/assignments`, payload);
        toast({ title: "Assignment created" });
      }
      queryClient.invalidateQueries({ queryKey: ["assignments", projectId] });
      setShowNew(false);
      setEditItem(null);
      resetForm();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function handleComplete(id: number) {
    try {
      await authFetch("POST", `/api/assignments/${id}/complete`);
      queryClient.invalidateQueries({ queryKey: ["assignments", projectId] });
      toast({ title: t("projects.markDone") });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this assignment?")) return;
    try {
      await authFetch("DELETE", `/api/assignments/${id}`);
      queryClient.invalidateQueries({ queryKey: ["assignments", projectId] });
      toast({ title: "Assignment deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  // Group assignments
  const now = new Date();
  const todayStr = now.toDateString();
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const groups: { label: string; items: ProjectAssignment[] }[] = [
    {
      label: "Overdue",
      items: assignments.filter(a =>
        a.status !== "done" && a.dueAt && new Date(a.dueAt) < now
      ),
    },
    {
      label: "Today",
      items: assignments.filter(a =>
        a.status !== "done" && a.dueAt && new Date(a.dueAt).toDateString() === todayStr && new Date(a.dueAt) >= now
      ),
    },
    {
      label: "This Week",
      items: assignments.filter(a =>
        a.status !== "done" && a.dueAt &&
        new Date(a.dueAt) > now &&
        new Date(a.dueAt) < weekEnd &&
        new Date(a.dueAt).toDateString() !== todayStr
      ),
    },
    {
      label: "Recurring",
      items: assignments.filter(a => a.type === "recurring" && a.status !== "done"),
    },
    {
      label: "Later",
      items: assignments.filter(a =>
        a.status !== "done" && !a.dueAt && a.type !== "recurring"
      ),
    },
    {
      label: "Done",
      items: assignments.filter(a => a.status === "done"),
    },
  ];

  function getMemberName(userId: number): string {
    return members.find(m => m.userId === userId)?.user?.username ?? `User ${userId}`;
  }

  return (
    <div className="space-y-4">
      <div className={`flex items-center justify-between ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
        <h3 className="text-sm font-semibold">{t("projects.calendar")}</h3>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditItem(null); resetForm(); setShowNew(true); }} data-testid="button-new-assignment">
          <Plus className="w-4 h-4" />
          {t("projects.newAssignment")}
        </Button>
      </div>

      {groups.every(g => g.items.length === 0) && (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No assignments yet. Create one to get started.
        </div>
      )}

      {groups.map(group => group.items.length > 0 && (
        <div key={group.label}>
          <h4 className={`text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 ${group.label === "Overdue" ? "text-destructive" : ""}`}>
            {group.label}
          </h4>
          <div className="space-y-1">
            {group.items.map(a => (
              <Card key={a.id} className="py-0">
                <CardContent className="flex items-center gap-3 px-3 py-2.5">
                  {/* Complete checkbox */}
                  <button
                    type="button"
                    onClick={() => a.status !== "done" && handleComplete(a.id)}
                    className={`shrink-0 transition-colors ${a.status === "done" ? "text-green-600 cursor-default" : "text-muted-foreground hover:text-primary"}`}
                    data-testid={`button-complete-${a.id}`}
                    aria-label="Mark complete"
                  >
                    {a.status === "done" ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                  </button>

                  {/* Priority dot */}
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[a.priority] ?? "bg-muted"}`} />

                  {/* Title + time */}
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${a.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                      {a.title}
                    </span>
                    {a.dueAt && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(a.dueAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {a.cronExpression && (
                      <span className="text-xs text-muted-foreground ml-2 font-mono">{a.cronExpression}</span>
                    )}
                  </div>

                  {/* Assigned-to avatar */}
                  <Avatar className="w-6 h-6 shrink-0">
                    <AvatarFallback className="text-[9px] text-white" style={{ backgroundColor: userColor(a.assignedTo) }}>
                      {getMemberName(a.assignedTo).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" data-testid={`button-assignment-menu-${a.id}`}>
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(a)} data-testid={`button-edit-assignment-${a.id}`}>
                        <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => handleDelete(a.id)}
                        data-testid={`button-delete-assignment-${a.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* New/Edit Assignment Dialog */}
      <Dialog open={showNew} onOpenChange={v => { if (!v) { setShowNew(false); setEditItem(null); } }}>
        <DialogContent className="max-w-md" dir={dir}>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Assignment" : t("projects.newAssignment")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="assign-title">Title</Label>
              <Input
                id="assign-title"
                data-testid="input-assignment-title"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="assign-desc">Description</Label>
              <Textarea
                id="assign-desc"
                data-testid="input-assignment-description"
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Assigned To</Label>
                <Select value={form.assignedTo} onValueChange={v => setForm(p => ({ ...p, assignedTo: v }))}>
                  <SelectTrigger data-testid="select-assignment-assignee">
                    <SelectValue placeholder="Select member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map(m => (
                      <SelectItem key={m.userId} value={String(m.userId)}>{m.user?.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger data-testid="select-assignment-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger data-testid="select-assignment-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">One-time</SelectItem>
                  <SelectItem value="recurring">Recurring</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.type === "one_time" && (
              <div className="space-y-1">
                <Label htmlFor="assign-due">Due Date & Time</Label>
                <Input
                  id="assign-due"
                  type="datetime-local"
                  data-testid="input-assignment-due"
                  value={form.dueAt}
                  onChange={e => setForm(p => ({ ...p, dueAt: e.target.value }))}
                />
              </div>
            )}
            {form.type === "recurring" && (
              <div className="space-y-2">
                <Label htmlFor="assign-cron">Cron Expression</Label>
                <Input
                  id="assign-cron"
                  data-testid="input-assignment-cron"
                  placeholder="0 9 * * 1-5"
                  value={form.cronExpression}
                  onChange={e => setForm(p => ({ ...p, cronExpression: e.target.value }))}
                />
                <div className="flex flex-wrap gap-1">
                  {CRON_PRESETS.map(preset => (
                    <button
                      key={preset.value}
                      type="button"
                      className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted transition-colors"
                      onClick={() => setForm(p => ({ ...p, cronExpression: preset.value }))}
                      data-testid={`cron-preset-${preset.value.replace(/\s+/g, "-")}`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="assign-reminder">Reminder (minutes before)</Label>
              <Input
                id="assign-reminder"
                type="number"
                data-testid="input-assignment-reminder"
                value={form.reminderMinutes}
                onChange={e => setForm(p => ({ ...p, reminderMinutes: e.target.value }))}
                min="0"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowNew(false); setEditItem(null); }} data-testid="button-cancel-assignment">Cancel</Button>
              <Button type="submit" data-testid="button-submit-assignment">
                {editItem ? "Save Changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Chat Tab ─────────────────────────────────────────────────────────────────

function ChatTab({ projectId, members }: {
  projectId: number;
  members: ProjectMemberWithUser[];
}) {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [isSending, setIsSending] = useState(false);

  const { data: messages = [] } = useQuery<ProjectMessage[]>({
    queryKey: ["messages", projectId],
    queryFn: async () => {
      const res = await authFetch("GET", `/api/projects/${projectId}/messages`);
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function getMemberName(userId: number | null): string {
    if (!userId) return "AI Assistant";
    return members.find(m => m.userId === userId)?.user?.username ?? `User ${userId}`;
  }

  // Mention detection
  function handleContentChange(val: string) {
    setContent(val);
    const atIdx = val.lastIndexOf("@");
    if (atIdx >= 0) {
      const after = val.slice(atIdx + 1);
      if (!after.includes(" ")) {
        setMentionSearch(after.toLowerCase());
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  }

  const filteredMentions = members.filter(m =>
    m.user?.username?.toLowerCase().includes(mentionSearch)
  );

  function insertMention(username: string) {
    const atIdx = content.lastIndexOf("@");
    setContent(content.slice(0, atIdx) + `@${username} `);
    setShowMentions(false);
  }

  async function handleSend() {
    if (!content.trim()) return;
    setIsSending(true);
    try {
      // Extract mention user ids
      const mentionPattern = /@(\w+)/g;
      const mentionedNames = [...content.matchAll(mentionPattern)].map(m => m[1]);
      const mentionsUserIds = members
        .filter(m => mentionedNames.includes(m.user?.username))
        .map(m => m.userId);

      await authFetch("POST", `/api/projects/${projectId}/messages`, {
        content: content.trim(),
        mentionsUserIds: mentionsUserIds.length > 0 ? mentionsUserIds : undefined,
      });
      setContent("");
      queryClient.invalidateQueries({ queryKey: ["messages", projectId] });
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") setShowMentions(false);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[400px]" dir={dir}>
      {/* Message list */}
      <ScrollArea className="flex-1 px-1">
        <div className="space-y-3 p-2">
          {messages.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No messages yet. Start the conversation.
            </div>
          )}
          {messages.map(msg => {
            const isMe = msg.userId === user?.id;
            const isAssistant = msg.role === "assistant";
            const name = getMemberName(msg.userId);

            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}
                data-testid={`message-${msg.id}`}
              >
                <Avatar className="w-7 h-7 shrink-0 mt-0.5">
                  <AvatarFallback
                    className="text-[9px] text-white"
                    style={{ backgroundColor: msg.userId ? userColor(msg.userId) : "#0d9488" }}
                  >
                    {isAssistant ? <Bot className="w-3.5 h-3.5" /> : getInitials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                  <div className={`flex items-center gap-1.5 ${isMe ? "flex-row-reverse" : ""}`}>
                    <span className="text-xs font-medium">{name}</span>
                    {isAssistant && <Badge variant="secondary" className="text-[9px] px-1 py-0">AI</Badge>}
                    <span className="text-[10px] text-muted-foreground">{timeAgo(msg.createdAt)}</span>
                  </div>
                  <div
                    className={`px-3 py-2 rounded-lg text-sm leading-relaxed ${
                      isAssistant
                        ? "bg-primary/10 border border-primary/20"
                        : isMe
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t p-3 space-y-2">
        <p className="text-xs text-muted-foreground">{t("projects.chatHint")}</p>
        <div className="relative">
          {/* Mention dropdown */}
          {showMentions && filteredMentions.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 bg-popover border rounded-md shadow-md z-10 min-w-40">
              {filteredMentions.map(m => (
                <button
                  key={m.userId}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors flex items-center gap-2"
                  onClick={() => insertMention(m.user?.username)}
                  data-testid={`mention-option-${m.userId}`}
                >
                  <Avatar className="w-5 h-5 shrink-0">
                    <AvatarFallback className="text-[8px] text-white" style={{ backgroundColor: userColor(m.userId) }}>
                      {getInitials(m.user?.username ?? "?")}
                    </AvatarFallback>
                  </Avatar>
                  {m.user?.username}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Textarea
              data-testid="input-chat-message"
              placeholder="Type a message... (@ to mention)"
              value={content}
              onChange={e => handleContentChange(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className="resize-none flex-1"
            />
            <Button
              onClick={handleSend}
              disabled={isSending || !content.trim()}
              className="self-end"
              data-testid="button-send-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Project>>({});

  // Fetch project detail
  const { data: project, isLoading: loadingProject } = useQuery<Project>({
    queryKey: ["project", projectId],
    queryFn: async () => {
      const res = await authFetch("GET", `/api/projects/${projectId}`);
      return res.json();
    },
    enabled: !!projectId,
  });

  // Fetch assignments
  const { data: assignments = [] } = useQuery<ProjectAssignment[]>({
    queryKey: ["assignments", projectId],
    queryFn: async () => {
      const res = await authFetch("GET", `/api/projects/${projectId}/assignments`);
      return res.json();
    },
    enabled: !!projectId,
  });

  // Fetch recent messages for Overview tab
  const { data: recentMessages = [] } = useQuery<ProjectMessage[]>({
    queryKey: ["messages", projectId],
    queryFn: async () => {
      const res = await authFetch("GET", `/api/projects/${projectId}/messages`);
      return res.json();
    },
    enabled: !!projectId,
    refetchInterval: 5000,
  });

  const members = project?.members ?? [];
  const isOwner = user?.id === project?.ownerId ||
    members.some(m => m.userId === user?.id && (m.role === "owner" || m.role === "manager"));

  async function handleDelete() {
    if (!confirm(`Delete project "${project?.name}"? This cannot be undone.`)) return;
    try {
      await authFetch("DELETE", `/api/projects/${projectId}`);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate("/projects");
      toast({ title: "Project deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await authFetch("PATCH", `/api/projects/${projectId}`, editForm);
      queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      setShowEdit(false);
      toast({ title: "Project updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }

  if (loadingProject) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 flex items-center gap-2 text-destructive">
        <AlertCircle className="w-5 h-5" />
        <span>Project not found.</span>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.planning;
  const deadlineLabel = formatDeadlineCountdown(project.deadline);
  const deadlineOverdue = project.deadline && new Date(project.deadline) < new Date();
  const accent = project.color ?? "#0d9488";

  return (
    <div className="flex flex-col h-full" dir={dir}>
      {/* Top header */}
      <div
        className="border-b px-4 py-3 space-y-2"
        style={{ borderLeftColor: accent, borderLeftWidth: 4 }}
      >
        <div className={`flex items-center justify-between ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
          <div className={`flex items-center gap-3 ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => navigate("/projects")}
              data-testid="button-back-to-projects"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-lg font-semibold">{project.name}</h1>
            <Badge variant={statusConfig.variant} className="text-xs">{statusConfig.label}</Badge>
          </div>
          <div className={`flex items-center gap-2 ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
            {deadlineLabel && (
              <span className={`text-xs flex items-center gap-1 ${deadlineOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                <Clock className="w-3.5 h-3.5" />
                {deadlineLabel}
              </span>
            )}
            <Badge variant="outline" className={`text-xs capitalize ${
              project.priority === "urgent" ? "border-red-500 text-red-600" :
              project.priority === "high" ? "border-orange-500 text-orange-600" :
              project.priority === "medium" ? "border-yellow-500 text-yellow-600" : ""
            }`}>
              {project.priority}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5"
              onClick={() => navigate(`/projects/${project.id}/actions`)}
              data-testid="button-project-actions"
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="text-xs">Actions</span>
            </Button>
            {isOwner && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid="button-project-menu">
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => { setEditForm({ name: project.name, description: project.description ?? "", status: project.status, priority: project.priority, deadline: project.deadline ?? "", color: project.color ?? "#0d9488" }); setShowEdit(true); }}
                    data-testid="button-edit-project"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Project
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={handleDelete}
                    data-testid="button-delete-project"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-auto p-4">
        <Tabs defaultValue="overview">
          <TabsList className="mb-4">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <LayoutDashboard className="w-4 h-4 mr-1.5" />{t("projects.overview")}
            </TabsTrigger>
            <TabsTrigger value="members" data-testid="tab-members">
              <Users className="w-4 h-4 mr-1.5" />{t("projects.members")}
            </TabsTrigger>
            <TabsTrigger value="calendar" data-testid="tab-calendar">
              <Calendar className="w-4 h-4 mr-1.5" />{t("projects.calendar")}
            </TabsTrigger>
            <TabsTrigger value="chat" data-testid="tab-chat">
              <MessageSquare className="w-4 h-4 mr-1.5" />{t("projects.chat")}
            </TabsTrigger>
            <TabsTrigger value="arms" data-testid="tab-arms">
              <GitBranch className="w-4 h-4 mr-1.5" />{t("arms.tab")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab
              project={project}
              assignments={assignments}
              messages={recentMessages}
              members={members}
            />
          </TabsContent>

          <TabsContent value="members">
            <MembersTab
              projectId={projectId}
              members={members}
              isOwner={isOwner}
            />
          </TabsContent>

          <TabsContent value="calendar">
            <CalendarTab
              projectId={projectId}
              assignments={assignments}
              members={members}
            />
          </TabsContent>

          <TabsContent value="chat">
            <ChatTab
              projectId={projectId}
              members={members}
            />
          </TabsContent>

          <TabsContent value="arms">
            <ProjectArmsTab projectId={projectId} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEdit} onOpenChange={v => !v && setShowEdit(false)}>
        <DialogContent className="max-w-md" dir={dir}>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                data-testid="input-edit-project-name"
                value={editForm.name ?? ""}
                onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                data-testid="input-edit-project-description"
                value={editForm.description ?? ""}
                onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={editForm.status ?? "planning"} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger data-testid="select-edit-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="on_hold">On Hold</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select value={editForm.priority ?? "medium"} onValueChange={v => setEditForm(p => ({ ...p, priority: v }))}>
                  <SelectTrigger data-testid="select-edit-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Deadline</Label>
              <Input
                type="date"
                data-testid="input-edit-deadline"
                value={editForm.deadline ?? ""}
                onChange={e => setEditForm(p => ({ ...p, deadline: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEdit(false)} data-testid="button-cancel-edit">Cancel</Button>
              <Button type="submit" data-testid="button-save-edit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
