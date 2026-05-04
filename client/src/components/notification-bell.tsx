import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuthFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, BellRing, CheckCheck } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  projectId: number | null;
  assignmentId: number | null;
  read: boolean;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const TYPE_ICONS: Record<string, string> = {
  assignment_due: "⏰",
  assignment_overdue: "🔴",
  project_invite: "📩",
  mention: "💬",
  project_message: "💬",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const authFetch = useAuthFetch();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);

  // Poll unread count every 30s
  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["notifications-unread-count"],
    queryFn: async () => {
      const res = await authFetch("GET", "/api/notifications/unread-count");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fetch full notifications list when popover opens
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await authFetch("GET", "/api/notifications");
      return res.json();
    },
    enabled: open,
  });

  const unreadCount = unreadData?.count ?? 0;
  // Sort newest first
  const sorted = [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  async function handleMarkRead(id: number) {
    try {
      await authFetch("POST", `/api/notifications/${id}/read`);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    } catch {}
  }

  async function handleMarkAllRead() {
    try {
      await authFetch("POST", "/api/notifications/mark-all-read");
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    } catch {}
  }

  function handleNotificationClick(n: Notification) {
    if (!n.read) handleMarkRead(n.id);
    if (n.link) navigate(n.link);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative h-8 w-8 p-0"
          data-testid="button-notifications-bell"
          aria-label="Notifications"
        >
          {unreadCount > 0 ? (
            <BellRing className="w-4 h-4" />
          ) : (
            <Bell className="w-4 h-4" />
          )}
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-0.5 leading-none"
              data-testid="notification-unread-badge"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-0" align="end" data-testid="notifications-popover">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1 px-2"
              onClick={handleMarkAllRead}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="max-h-80">
          {sorted.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No notifications
            </div>
          ) : (
            <div>
              {sorted.map(n => (
                <button
                  key={n.id}
                  type="button"
                  className={`w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b last:border-0 flex gap-2.5 items-start ${!n.read ? "bg-primary/5" : ""}`}
                  onClick={() => handleNotificationClick(n)}
                  data-testid={`notification-item-${n.id}`}
                >
                  {/* Unread dot */}
                  <div className="mt-1.5 shrink-0">
                    {!n.read ? (
                      <div className="w-2 h-2 rounded-full bg-primary" aria-label="Unread" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-transparent" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <p className={`text-xs leading-snug ${!n.read ? "font-semibold" : "font-medium"}`}>
                        {TYPE_ICONS[n.type] ?? "•"} {n.title}
                      </p>
                      <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{timeAgo(n.createdAt)}</span>
                    </div>
                    {n.body && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{n.body}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
