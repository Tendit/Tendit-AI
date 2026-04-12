import { useState, useEffect } from "react";
import { useAuthFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Bot, Plus, Trash2, UserPlus, UserMinus, Clock, CheckCircle, XCircle, Users, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

interface Agent {
  id: number;
  name: string;
  description: string | null;
  avatar: string | null;
  capabilities: string;
  systemPrompt: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
  approvalMode: string;
  isActive: boolean;
  createdAt: string;
}

interface Assignment {
  id: number;
  agentId: number;
  userId: number;
  isActive: boolean;
  assignedAt: string;
}

interface AgentRequest {
  id: number;
  agentId: number;
  userId: number;
  conversationId: number | null;
  actionType: string;
  actionData: string;
  status: string;
  resolvedBy: number | null;
  resolvedAt: string | null;
  createdAt: string;
}

interface SimpleUser {
  id: number;
  username: string;
  email: string;
}

const CAPABILITY_OPTIONS = [
  { value: "create_event", label: "Create Event", labelHe: "יצירת אירוע" },
  { value: "set_reminder", label: "Set Reminder", labelHe: "הגדרת תזכורת" },
  { value: "set_alarm", label: "Set Alarm", labelHe: "הגדרת התראה" },
  { value: "create_task", label: "Create Task", labelHe: "יצירת משימה" },
];

const DEFAULT_EMOJIS = ["🤖", "👨‍💼", "👩‍💼", "🧑‍💻", "📅", "⏰", "🎯", "🚀", "💼", "🗓️"];

export default function AdminAgentsPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const { t, locale, dir } = useI18n();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [pendingRequests, setPendingRequests] = useState<AgentRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newAvatar, setNewAvatar] = useState("🤖");
  const [newCaps, setNewCaps] = useState<string[]>(["create_event", "set_reminder", "set_alarm", "create_task"]);
  const [newPrompt, setNewPrompt] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newApproval, setNewApproval] = useState("auto");

  // Assignment dialog
  const [assignAgentId, setAssignAgentId] = useState<number | null>(null);
  const [assignUserId, setAssignUserId] = useState<string>("");
  const [agentAssignments, setAgentAssignments] = useState<Record<number, Assignment[]>>({});

  // Expanded agents
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [agentsRes, usersRes, reqRes] = await Promise.all([
        authFetch("GET", "/api/admin/agents"),
        authFetch("GET", "/api/admin/users"),
        authFetch("GET", "/api/admin/agent-requests"),
      ]);
      const agentsData = await agentsRes.json();
      const usersData = await usersRes.json();
      const reqData = await reqRes.json();
      setAgents(agentsData);
      setUsers(usersData);
      setPendingRequests(reqData);

      // Load assignments for each agent
      const assignMap: Record<number, Assignment[]> = {};
      for (const agent of agentsData) {
        try {
          const aRes = await authFetch("GET", `/api/admin/agents/${agent.id}/assignments`);
          assignMap[agent.id] = await aRes.json();
        } catch { assignMap[agent.id] = []; }
      }
      setAgentAssignments(assignMap);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const createAgent = async () => {
    if (!newName.trim()) return;
    try {
      await authFetch("POST", "/api/admin/agents", {
        name: newName.trim(),
        description: newDesc.trim(),
        avatar: newAvatar,
        capabilities: newCaps,
        systemPrompt: newPrompt.trim(),
        ownerEmail: newEmail.trim(),
        ownerPhone: newPhone.trim(),
        approvalMode: newApproval,
      });
      toast({ title: locale === "he" ? "הסוכן נוצר" : "Agent created" });
      setShowCreate(false);
      resetForm();
      loadAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setNewName(""); setNewDesc(""); setNewAvatar("🤖"); setNewPrompt("");
    setNewEmail(""); setNewPhone(""); setNewApproval("auto");
    setNewCaps(["create_event", "set_reminder", "set_alarm", "create_task"]);
  };

  const deleteAgent = async (id: number) => {
    try {
      await authFetch("DELETE", `/api/admin/agents/${id}`);
      toast({ title: locale === "he" ? "הסוכן נמחק" : "Agent deleted" });
      loadAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const toggleAgentActive = async (agent: Agent) => {
    try {
      await authFetch("PATCH", `/api/admin/agents/${agent.id}`, { isActive: !agent.isActive });
      toast({ title: agent.isActive ? (locale === "he" ? "סוכן הושבת" : "Agent deactivated") : (locale === "he" ? "סוכן הופעל" : "Agent activated") });
      loadAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const assignUser = async () => {
    if (!assignAgentId || !assignUserId) return;
    try {
      await authFetch("POST", `/api/admin/agents/${assignAgentId}/assign`, { userId: parseInt(assignUserId) });
      toast({ title: locale === "he" ? "משתמש שויך" : "User assigned" });
      setAssignAgentId(null);
      setAssignUserId("");
      loadAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const unassignUser = async (agentId: number, userId: number) => {
    try {
      await authFetch("POST", `/api/admin/agents/${agentId}/unassign`, { userId });
      toast({ title: locale === "he" ? "שיוך הוסר" : "User unassigned" });
      loadAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const resolveRequest = async (id: number, status: "approved" | "declined") => {
    try {
      await authFetch("POST", `/api/admin/agent-requests/${id}/resolve`, { status });
      toast({ title: status === "approved" ? (locale === "he" ? "אושר" : "Approved") : (locale === "he" ? "נדחה" : "Declined") });
      loadAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const getUserName = (userId: number) => {
    const u = users.find(u => u.id === userId);
    return u ? u.username : `User #${userId}`;
  };

  const parseCapabilities = (caps: string): string[] => {
    try { return JSON.parse(caps); } catch { return []; }
  };

  const formatActionData = (data: string) => {
    try {
      const parsed = JSON.parse(data);
      return `${parsed.action}: ${parsed.title || ""}${parsed.date ? ` (${parsed.date})` : ""}${parsed.time ? ` ${parsed.time}` : ""}`;
    } catch { return data; }
  };

  const isRtl = dir === "rtl";
  const en = locale === "en";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className={`flex items-center justify-between ${isRtl ? "flex-row-reverse" : ""}`}>
        <div className={isRtl ? "text-right" : ""}>
          <h1 className="text-xl font-bold">{en ? "Agents" : "סוכנים"}</h1>
          <p className="text-sm text-muted-foreground">{en ? "Create agents and assign them to users" : "צור סוכנים ושייך אותם למשתמשים"}</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-agent"><Plus className="w-4 h-4 mr-1" />{en ? "New Agent" : "סוכן חדש"}</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{en ? "Create Agent" : "יצירת סוכן"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>{en ? "Name" : "שם"}</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder={en ? "e.g. Johnny" : "לדוגמה: ג׳וני"} data-testid="input-agent-name" />
              </div>
              <div className="space-y-1">
                <Label>{en ? "Description" : "תיאור"}</Label>
                <Input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder={en ? "Personal assistant & scheduler" : "עוזר אישי ומתזמן"} data-testid="input-agent-desc" />
              </div>
              <div className="space-y-1">
                <Label>{en ? "Avatar" : "אווטאר"}</Label>
                <div className="flex gap-1 flex-wrap">
                  {DEFAULT_EMOJIS.map(e => (
                    <button key={e} onClick={() => setNewAvatar(e)} className={`text-xl p-1.5 rounded-md border transition-colors ${newAvatar === e ? "border-primary bg-primary/10" : "border-transparent hover:border-muted-foreground/30"}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>{en ? "Capabilities" : "יכולות"}</Label>
                <div className="flex flex-wrap gap-2">
                  {CAPABILITY_OPTIONS.map(cap => (
                    <label key={cap.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newCaps.includes(cap.value)}
                        onChange={e => {
                          if (e.target.checked) setNewCaps([...newCaps, cap.value]);
                          else setNewCaps(newCaps.filter(c => c !== cap.value));
                        }}
                        className="rounded"
                      />
                      {en ? cap.label : cap.labelHe}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <Label>{en ? "Approval Mode" : "מצב אישור"}</Label>
                <Select value={newApproval} onValueChange={setNewApproval}>
                  <SelectTrigger data-testid="select-approval-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">{en ? "Auto (execute immediately)" : "אוטומטי (בצע מיד)"}</SelectItem>
                    <SelectItem value="request">{en ? "Request (owner approves)" : "בקשה (בעלים מאשר)"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{en ? "System Prompt (optional)" : "הנחיות מערכת (אופציונלי)"}</Label>
                <Textarea value={newPrompt} onChange={e => setNewPrompt(e.target.value)} rows={3} placeholder={en ? "Additional personality or instructions..." : "אישיות נוספת או הנחיות..."} data-testid="input-agent-prompt" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{en ? "Owner Email" : "אימייל בעלים"}</Label>
                  <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="owner@email.com" data-testid="input-agent-email" />
                </div>
                <div className="space-y-1">
                  <Label>{en ? "Owner Phone" : "טלפון בעלים"}</Label>
                  <Input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+972..." data-testid="input-agent-phone" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>{en ? "Cancel" : "ביטול"}</Button>
              <Button onClick={createAgent} disabled={!newName.trim()} data-testid="button-save-agent">{en ? "Create" : "צור"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{agents.length}</div>
            <div className="text-xs text-muted-foreground">{en ? "Total Agents" : "סה״כ סוכנים"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{agents.filter(a => a.isActive).length}</div>
            <div className="text-xs text-muted-foreground">{en ? "Active" : "פעילים"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{Object.values(agentAssignments).flat().filter(a => a.isActive).length}</div>
            <div className="text-xs text-muted-foreground">{en ? "Assignments" : "שיוכים"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className={`text-2xl font-bold ${pendingRequests.length > 0 ? "text-yellow-600" : ""}`}>{pendingRequests.length}</div>
            <div className="text-xs text-muted-foreground">{en ? "Pending Requests" : "בקשות ממתינות"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card className="border-yellow-500/30">
          <CardHeader className="pb-3">
            <CardTitle className={`flex items-center gap-2 text-base ${isRtl ? "flex-row-reverse" : ""}`}>
              <AlertCircle className="w-4 h-4 text-yellow-500" />
              {en ? "Pending Approval" : "ממתין לאישור"}
              <Badge variant="secondary">{pendingRequests.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{en ? "Agent" : "סוכן"}</TableHead>
                  <TableHead>{en ? "User" : "משתמש"}</TableHead>
                  <TableHead>{en ? "Action" : "פעולה"}</TableHead>
                  <TableHead>{en ? "Details" : "פרטים"}</TableHead>
                  <TableHead>{en ? "Time" : "זמן"}</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRequests.map(req => {
                  const agent = agents.find(a => a.id === req.agentId);
                  return (
                    <TableRow key={req.id}>
                      <TableCell className="font-medium">
                        <span className="mr-1">{agent?.avatar || "🤖"}</span>
                        {agent?.name || `Agent #${req.agentId}`}
                      </TableCell>
                      <TableCell>{getUserName(req.userId)}</TableCell>
                      <TableCell><Badge variant="outline">{req.actionType.replace("_", " ")}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{formatActionData(req.actionData)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(req.createdAt).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="default" onClick={() => resolveRequest(req.id, "approved")} data-testid={`button-approve-${req.id}`}>
                            <CheckCircle className="w-3 h-3 mr-1" />{en ? "Approve" : "אשר"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => resolveRequest(req.id, "declined")} data-testid={`button-decline-${req.id}`}>
                            <XCircle className="w-3 h-3 mr-1" />{en ? "Decline" : "דחה"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Agents List */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">{en ? "Loading..." : "טוען..."}</div>
      ) : agents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Bot className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{en ? "No agents yet. Create your first agent above." : "אין סוכנים עדיין. צור את הסוכן הראשון."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {agents.map(agent => {
            const caps = parseCapabilities(agent.capabilities);
            const assignments = agentAssignments[agent.id] || [];
            const isExpanded = expandedAgent === agent.id;

            return (
              <Card key={agent.id} className={!agent.isActive ? "opacity-60" : ""}>
                <CardContent className="p-4">
                  {/* Agent header row */}
                  <div className={`flex items-center gap-3 ${isRtl ? "flex-row-reverse" : ""}`}>
                    <span className="text-2xl">{agent.avatar || "🤖"}</span>
                    <div className={`flex-1 min-w-0 ${isRtl ? "text-right" : ""}`}>
                      <div className={`flex items-center gap-2 ${isRtl ? "flex-row-reverse" : ""}`}>
                        <span className="font-semibold">{agent.name}</span>
                        <Badge variant={agent.isActive ? "default" : "secondary"} className="text-xs">
                          {agent.isActive ? (en ? "Active" : "פעיל") : (en ? "Inactive" : "לא פעיל")}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {agent.approvalMode === "auto" ? (en ? "Auto" : "אוטומטי") : (en ? "Request" : "בקשה")}
                        </Badge>
                      </div>
                      {agent.description && <p className="text-sm text-muted-foreground truncate">{agent.description}</p>}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {caps.map(c => (
                          <Badge key={c} variant="outline" className="text-xs font-normal">{c.replace("_", " ")}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className={`flex items-center gap-2 shrink-0 ${isRtl ? "flex-row-reverse" : ""}`}>
                      <Badge variant="secondary" className="text-xs">
                        <Users className="w-3 h-3 mr-1" />{assignments.filter(a => a.isActive).length}
                      </Badge>
                      <Switch checked={agent.isActive} onCheckedChange={() => toggleAgentActive(agent)} data-testid={`switch-active-${agent.id}`} />
                      <Button variant="ghost" size="icon" onClick={() => setExpandedAgent(isExpanded ? null : agent.id)} data-testid={`button-expand-${agent.id}`}>
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-4 space-y-4">
                      <Separator />

                      {/* Assigned Users */}
                      <div>
                        <div className={`flex items-center justify-between mb-2 ${isRtl ? "flex-row-reverse" : ""}`}>
                          <h3 className="text-sm font-semibold">{en ? "Assigned Users" : "משתמשים משויכים"}</h3>
                          <Dialog open={assignAgentId === agent.id} onOpenChange={open => { if (!open) setAssignAgentId(null); }}>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" onClick={() => setAssignAgentId(agent.id)} data-testid={`button-assign-${agent.id}`}>
                                <UserPlus className="w-3 h-3 mr-1" />{en ? "Assign User" : "שייך משתמש"}
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>{en ? `Assign user to ${agent.name}` : `שייך משתמש ל${agent.name}`}</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-3">
                                <Select value={assignUserId} onValueChange={setAssignUserId}>
                                  <SelectTrigger data-testid="select-assign-user"><SelectValue placeholder={en ? "Select user..." : "בחר משתמש..."} /></SelectTrigger>
                                  <SelectContent>
                                    {users
                                      .filter(u => !assignments.some(a => a.userId === u.id && a.isActive))
                                      .map(u => (
                                        <SelectItem key={u.id} value={String(u.id)}>{u.username} ({u.email})</SelectItem>
                                      ))
                                    }
                                  </SelectContent>
                                </Select>
                              </div>
                              <DialogFooter>
                                <Button variant="outline" onClick={() => setAssignAgentId(null)}>{en ? "Cancel" : "ביטול"}</Button>
                                <Button onClick={assignUser} disabled={!assignUserId} data-testid="button-confirm-assign">{en ? "Assign" : "שייך"}</Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                        {assignments.filter(a => a.isActive).length === 0 ? (
                          <p className="text-xs text-muted-foreground">{en ? "No users assigned." : "אין משתמשים משויכים."}</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {assignments.filter(a => a.isActive).map(a => {
                              const u = users.find(u => u.id === a.userId);
                              return (
                                <div key={a.id} className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-sm ${isRtl ? "flex-row-reverse" : ""}`}>
                                  <span>{u?.username || `#${a.userId}`}</span>
                                  <button onClick={() => unassignUser(agent.id, a.userId)} className="text-muted-foreground hover:text-destructive transition-colors" data-testid={`button-unassign-${a.userId}`}>
                                    <UserMinus className="w-3 h-3" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Agent info */}
                      {agent.systemPrompt && (
                        <div>
                          <h3 className="text-sm font-semibold mb-1">{en ? "System Prompt" : "הנחיות מערכת"}</h3>
                          <p className="text-xs text-muted-foreground bg-muted p-2 rounded-md whitespace-pre-wrap max-h-24 overflow-y-auto">{agent.systemPrompt}</p>
                        </div>
                      )}

                      <div className={`flex items-center gap-4 text-xs text-muted-foreground ${isRtl ? "flex-row-reverse" : ""}`}>
                        {agent.ownerEmail && <span>{en ? "Owner" : "בעלים"}: {agent.ownerEmail}</span>}
                        {agent.ownerPhone && <span>{en ? "Phone" : "טלפון"}: {agent.ownerPhone}</span>}
                        <span>{en ? "Created" : "נוצר"}: {new Date(agent.createdAt).toLocaleDateString()}</span>
                      </div>

                      <div className={`flex gap-2 ${isRtl ? "flex-row-reverse" : ""}`}>
                        <Button size="sm" variant="destructive" onClick={() => deleteAgent(agent.id)} data-testid={`button-delete-${agent.id}`}>
                          <Trash2 className="w-3 h-3 mr-1" />{en ? "Delete Agent" : "מחק סוכן"}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
