import { useState, useEffect, useMemo } from "react";
import { useAuthFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Clock, Bell, AlarmClock, CheckSquare, Check, X, Trash2, CalendarIcon } from "lucide-react";

interface ScheduleItem {
  id: number;
  userId: number;
  agentId: number | null;
  requestId: number | null;
  type: string;
  title: string;
  date: string;
  time: string | null;
  endTime: string | null;
  location: string | null;
  notes: string | null;
  reminderMinutes: number | null;
  priority: string | null;
  status: string;
  conversationId: number | null;
  createdAt: string;
}

const TYPE_ICONS: Record<string, any> = {
  event: CalendarDays,
  reminder: Bell,
  alarm: AlarmClock,
  task: CheckSquare,
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "text-red-500 border-red-500/30",
  medium: "text-yellow-500 border-yellow-500/30",
  low: "text-green-500 border-green-500/30",
};

export default function SchedulePage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const { locale, dir } = useI18n();

  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("upcoming");

  const en = locale === "en";
  const isRtl = dir === "rtl";

  useEffect(() => { loadSchedule(); }, []);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const res = await authFetch("GET", "/api/schedule");
      setItems(await res.json());
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      await authFetch("PATCH", `/api/schedule/${id}`, { status });
      toast({ title: status === "completed" ? (en ? "Completed" : "הושלם") : (en ? "Dismissed" : "נדחה") });
      loadSchedule();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const deleteItem = async (id: number) => {
    try {
      await authFetch("DELETE", `/api/schedule/${id}`);
      toast({ title: en ? "Deleted" : "נמחק" });
      loadSchedule();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const today = new Date().toISOString().split("T")[0];

  const { upcoming, past, completed } = useMemo(() => {
    const upcoming: ScheduleItem[] = [];
    const past: ScheduleItem[] = [];
    const completed: ScheduleItem[] = [];

    for (const item of items) {
      if (item.status === "completed" || item.status === "dismissed") {
        completed.push(item);
      } else if (item.date >= today) {
        upcoming.push(item);
      } else {
        past.push(item);
      }
    }

    upcoming.sort((a, b) => {
      const dateA = `${a.date} ${a.time || "00:00"}`;
      const dateB = `${b.date} ${b.time || "00:00"}`;
      return dateA.localeCompare(dateB);
    });
    past.sort((a, b) => b.date.localeCompare(a.date));
    completed.sort((a, b) => b.date.localeCompare(a.date));

    return { upcoming, past, completed };
  }, [items, today]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    if (dateStr === today) return en ? "Today" : "היום";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateStr === tomorrow.toISOString().split("T")[0]) return en ? "Tomorrow" : "מחר";
    return d.toLocaleDateString(locale === "he" ? "he-IL" : "en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const renderItem = (item: ScheduleItem) => {
    const Icon = TYPE_ICONS[item.type] || CalendarDays;
    const isActive = item.status === "active";
    const priorityClass = item.priority ? PRIORITY_COLORS[item.priority] || "" : "";

    return (
      <div
        key={item.id}
        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${isActive ? "bg-card hover:bg-accent/50" : "bg-muted/30 opacity-60"} ${isRtl ? "flex-row-reverse" : ""}`}
        data-testid={`schedule-item-${item.id}`}
      >
        <div className={`mt-0.5 p-1.5 rounded-md border ${priorityClass || "text-muted-foreground"}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className={`flex-1 min-w-0 ${isRtl ? "text-right" : ""}`}>
          <div className={`flex items-center gap-2 ${isRtl ? "flex-row-reverse" : ""}`}>
            <span className={`font-medium text-sm ${!isActive ? "line-through" : ""}`}>{item.title}</span>
            <Badge variant="outline" className="text-xs capitalize">{item.type}</Badge>
            {item.priority && item.priority !== "medium" && (
              <Badge variant="outline" className={`text-xs capitalize ${priorityClass}`}>{item.priority}</Badge>
            )}
          </div>
          <div className={`flex items-center gap-2 mt-0.5 text-xs text-muted-foreground ${isRtl ? "flex-row-reverse" : ""}`}>
            <span className="flex items-center gap-1"><CalendarIcon className="w-3 h-3" />{formatDate(item.date)}</span>
            {item.time && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{item.time}{item.endTime ? ` - ${item.endTime}` : ""}</span>}
            {item.location && <span>📍 {item.location}</span>}
            {item.reminderMinutes && item.reminderMinutes > 0 && (
              <span className="flex items-center gap-1"><Bell className="w-3 h-3" />{item.reminderMinutes}{en ? "min before" : "דק׳ לפני"}</span>
            )}
          </div>
          {item.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{item.notes}</p>}
        </div>
        {isActive && (
          <div className={`flex items-center gap-1 shrink-0 ${isRtl ? "flex-row-reverse" : ""}`}>
            {item.type === "task" && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateStatus(item.id, "completed")} data-testid={`button-complete-${item.id}`}>
                <Check className="w-3.5 h-3.5 text-green-500" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateStatus(item.id, "dismissed")} data-testid={`button-dismiss-${item.id}`}>
              <X className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteItem(item.id)} data-testid={`button-delete-${item.id}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  const groupByDate = (items: ScheduleItem[]) => {
    const groups: Record<string, ScheduleItem[]> = {};
    for (const item of items) {
      if (!groups[item.date]) groups[item.date] = [];
      groups[item.date].push(item);
    }
    return groups;
  };

  const renderGrouped = (items: ScheduleItem[]) => {
    if (items.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">{en ? "Nothing here." : "אין פריטים."}</p>
        </div>
      );
    }
    const groups = groupByDate(items);
    return (
      <div className="space-y-4">
        {Object.entries(groups).map(([date, dateItems]) => (
          <div key={date}>
            <h3 className={`text-xs font-semibold text-muted-foreground uppercase mb-2 ${isRtl ? "text-right" : ""}`}>
              {formatDate(date)}
            </h3>
            <div className="space-y-2">
              {dateItems.map(renderItem)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className={isRtl ? "text-right" : ""}>
        <h1 className="text-xl font-bold">{en ? "My Schedule" : "לוח הזמנים שלי"}</h1>
        <p className="text-sm text-muted-foreground">{en ? "Events, reminders, alarms, and tasks from your agents" : "אירועים, תזכורות, התראות ומשימות מהסוכנים שלך"}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{upcoming.length}</div>
            <div className="text-xs text-muted-foreground">{en ? "Upcoming" : "קרוב"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{upcoming.filter(i => i.date === today).length}</div>
            <div className="text-xs text-muted-foreground">{en ? "Today" : "היום"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{items.filter(i => i.type === "task" && i.status === "active").length}</div>
            <div className="text-xs text-muted-foreground">{en ? "Open Tasks" : "משימות פתוחות"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{completed.length}</div>
            <div className="text-xs text-muted-foreground">{en ? "Completed" : "הושלמו"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">{en ? "Loading..." : "טוען..."}</div>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="upcoming" data-testid="tab-upcoming">
              {en ? "Upcoming" : "קרוב"} {upcoming.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{upcoming.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="past" data-testid="tab-past">
              {en ? "Past" : "עבר"} {past.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{past.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="completed" data-testid="tab-completed">
              {en ? "Done" : "הושלמו"} {completed.length > 0 && <Badge variant="secondary" className="ml-1 text-xs">{completed.length}</Badge>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="upcoming" className="mt-4">{renderGrouped(upcoming)}</TabsContent>
          <TabsContent value="past" className="mt-4">{renderGrouped(past)}</TabsContent>
          <TabsContent value="completed" className="mt-4">{renderGrouped(completed)}</TabsContent>
        </Tabs>
      )}
    </div>
  );
}
