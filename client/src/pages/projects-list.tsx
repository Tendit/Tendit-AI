import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { useAuthFetch } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  FolderKanban, Plus, Calendar, Users, CheckSquare, AlertCircle, Layers
} from "lucide-react";

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
  members?: { id: number; userId: number; role: string }[];
  counts?: { assignments: number; messages: number };
}

interface AgentOption {
  id: number;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  planning: { label: "Planning", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  on_hold: { label: "On Hold", variant: "outline" },
  completed: { label: "Completed", variant: "secondary" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "text-muted-foreground" },
  medium: { label: "Medium", color: "text-yellow-600 dark:text-yellow-400" },
  high: { label: "High", color: "text-orange-600 dark:text-orange-400" },
  urgent: { label: "Urgent", color: "text-red-600 dark:text-red-400" },
};

const COLOR_PALETTE = [
  "#0d9488", "#2563eb", "#7c3aed", "#db2777", "#ea580c",
  "#65a30d", "#0891b2", "#b45309", "#4338ca", "#be185d",
];

function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  const now = new Date();
  const diff = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  return `${diff}d left`;
}

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ─── New Project Dialog ────────────────────────────────────────────────────────

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

function NewProjectDialog({ open, onClose, onCreated }: NewProjectDialogProps) {
  const { t, dir } = useI18n();
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "planning",
    priority: "medium",
    startDate: "",
    deadline: "",
    color: "#0d9488",
    agentId: "",
  });
  const [isLoading, setIsLoading] = useState(false);

  // Fetch agents for picker
  const { data: agents } = useQuery<AgentOption[]>({
    queryKey: ["agents-list"],
    queryFn: async () => {
      const res = await authFetch("GET", "/api/agents");
      return res.json();
    },
    enabled: open,
  });

  function handleChange(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        description: form.description || null,
        status: form.status,
        priority: form.priority,
        color: form.color,
        startDate: form.startDate || null,
        deadline: form.deadline || null,
        agentId: form.agentId ? Number(form.agentId) : null,
      };
      const res = await authFetch("POST", "/api/projects", payload);
      const created = await res.json();
      toast({ title: t("projects.created"), description: created.name });
      onCreated(created);
      onClose();
      setForm({ name: "", description: "", status: "planning", priority: "medium", startDate: "", deadline: "", color: "#0d9488", agentId: "" });
    } catch (err: any) {
      toast({ title: "Error creating project", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md" dir={dir}>
        <DialogHeader>
          <DialogTitle>{t("projects.newProject")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="proj-name">{t("projects.name")}</Label>
            <Input
              id="proj-name"
              data-testid="input-project-name"
              value={form.name}
              onChange={e => handleChange("name", e.target.value)}
              placeholder="Project name"
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="proj-desc">{t("projects.description")}</Label>
            <Input
              id="proj-desc"
              data-testid="input-project-description"
              value={form.description}
              onChange={e => handleChange("description", e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t("projects.status")}</Label>
              <Select value={form.status} onValueChange={v => handleChange("status", v)}>
                <SelectTrigger data-testid="select-project-status">
                  <SelectValue />
                </SelectTrigger>
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
              <Label>{t("projects.priority")}</Label>
              <Select value={form.priority} onValueChange={v => handleChange("priority", v)}>
                <SelectTrigger data-testid="select-project-priority">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="proj-start">{t("projects.startDate")}</Label>
              <Input
                id="proj-start"
                data-testid="input-project-start-date"
                type="date"
                value={form.startDate}
                onChange={e => handleChange("startDate", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="proj-deadline">{t("projects.deadline")}</Label>
              <Input
                id="proj-deadline"
                data-testid="input-project-deadline"
                type="date"
                value={form.deadline}
                onChange={e => handleChange("deadline", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{t("projects.agent")}</Label>
            <Select value={form.agentId} onValueChange={v => handleChange("agentId", v)}>
              <SelectTrigger data-testid="select-project-agent">
                <SelectValue placeholder="Default (Johnny)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Default (Johnny)</SelectItem>
                {agents?.map(a => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t("projects.color")}</Label>
            <div className="flex gap-2 flex-wrap" data-testid="color-palette">
              {COLOR_PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  data-testid={`color-swatch-${c.replace("#", "")}`}
                  onClick={() => handleChange("color", c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-project">
              {t("projects.cancel")}
            </Button>
            <Button type="submit" disabled={isLoading} data-testid="button-submit-project">
              {isLoading ? t("projects.creating") : t("projects.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Project Card ──────────────────────────────────────────────────────────────

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const statusConfig = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.planning;
  const priorityConfig = PRIORITY_CONFIG[project.priority] ?? PRIORITY_CONFIG.medium;
  const deadlineLabel = formatDeadline(project.deadline);
  const deadlineOverdue = project.deadline && new Date(project.deadline) < new Date();
  const memberCount = project.members?.length ?? 0;
  const assignmentCount = project.counts?.assignments ?? 0;
  const accent = project.color ?? "#0d9488";

  return (
    <Card
      className="relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
      data-testid={`project-card-${project.id}`}
    >
      {/* Color accent strip */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: accent }}
        aria-hidden="true"
      />
      <CardContent className="pl-4 pr-4 pt-4 pb-3 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate leading-tight">{project.name}</h3>
            {project.description && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">{project.description}</p>
            )}
          </div>
          <Badge variant={statusConfig.variant} className="shrink-0 text-xs">
            {statusConfig.label}
          </Badge>
        </div>

        {/* Priority + Deadline */}
        <div className="flex items-center gap-3 text-xs">
          <span className={`font-medium ${priorityConfig.color}`}>
            {priorityConfig.label}
          </span>
          {deadlineLabel && (
            <span className={`flex items-center gap-1 ${deadlineOverdue ? "text-destructive" : "text-muted-foreground"}`}>
              <Calendar className="w-3 h-3" />
              {deadlineLabel}
            </span>
          )}
        </div>

        {/* Footer: members + assignments */}
        <div className="flex items-center justify-between">
          {/* Overlapping member avatars */}
          <div className="flex -space-x-1.5" data-testid={`member-avatars-${project.id}`}>
            {(project.members ?? []).slice(0, 4).map((m, i) => (
              <Avatar key={m.userId} className="w-6 h-6 border border-background ring-1 ring-background">
                <AvatarFallback className="text-[9px]" style={{ backgroundColor: COLOR_PALETTE[m.userId % COLOR_PALETTE.length] }}>
                  {String(m.userId).slice(-1)}
                </AvatarFallback>
              </Avatar>
            ))}
            {memberCount > 4 && (
              <Avatar className="w-6 h-6 border border-background">
                <AvatarFallback className="text-[9px] bg-muted">+{memberCount - 4}</AvatarFallback>
              </Avatar>
            )}
          </div>

          {/* Assignment count */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{assignmentCount}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ProjectsListPage() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const { toast } = useToast();

  const { data: projects, isLoading, error } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await authFetch("GET", "/api/projects");
      return res.json();
    },
  });

  function handleProjectCreated(project: Project) {
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    navigate(`/projects/${project.id}`);
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex items-center gap-2 text-destructive">
        <AlertCircle className="w-5 h-5" />
        <span className="text-sm">Failed to load projects. Please try again.</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5" dir={dir}>
      {/* Header */}
      <div className={`flex items-center justify-between ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
        <div className={`flex items-center gap-2 ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
          <FolderKanban className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-semibold">{t("projects.title")}</h1>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          data-testid="button-create-project"
          size="sm"
          className={`gap-1.5 ${dir === "rtl" ? "flex-row-reverse" : ""}`}
        >
          <Plus className="w-4 h-4" />
          {t("projects.newProject")}
        </Button>
      </div>

      {/* Grid or Empty State */}
      {!projects || projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <Layers className="w-12 h-12 text-muted-foreground/40" />
          <div>
            <p className="font-medium text-muted-foreground">{t("projects.empty")}</p>
            <p className="text-sm text-muted-foreground/70 mt-1">{t("projects.emptyHint")}</p>
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            data-testid="button-create-project-empty"
            variant="outline"
            className="gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {t("projects.newProject")}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => navigate(`/projects/${project.id}`)}
            />
          ))}
        </div>
      )}

      {/* New Project Dialog */}
      <NewProjectDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleProjectCreated}
      />
    </div>
  );
}
