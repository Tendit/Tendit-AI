import { useState, useEffect } from "react";
import { useAuthFetch } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Plus, Pencil, Trash2, Globe, Star, Filter } from "lucide-react";

interface CalendarEvent {
  id: number;
  name: string;
  date: string;
  endDate?: string;
  region: string;
  category: string;
  subcategory?: string;
  importance: number;
  description?: string;
  tags?: string;
  isRecurring: boolean;
  isActive: boolean;
}

const regionColors: Record<string, string> = {
  global: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  US: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  IL: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  UK: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
};

const categoryColors: Record<string, string> = {
  holiday: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  religious: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  cultural: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  business: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  marketing: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
};

const importanceLabels: Record<number, string> = { 1: "Major", 2: "Standard", 3: "Minor" };

export default function AdminCalendarPage() {
  const authFetch = useAuthFetch();
  const { toast } = useToast();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [stats, setStats] = useState<{ total: number; byRegion: Record<string, number>; byCategory: Record<string, number> }>({ total: 0, byRegion: {}, byCategory: {} });
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<Partial<CalendarEvent> | null>(null);
  const [filterRegion, setFilterRegion] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [evRes, stRes] = await Promise.all([
        authFetch("GET", "/api/admin/calendar"),
        authFetch("GET", "/api/admin/calendar/stats"),
      ]);
      setEvents(await evRes.json());
      setStats(await stRes.json());
    } catch {}
    setIsLoading(false);
  };

  const saveEvent = async () => {
    if (!editEvent?.name || !editEvent?.date) {
      toast({ title: "Name and date required", variant: "destructive" });
      return;
    }
    try {
      if (editEvent.id) {
        await authFetch("PATCH", `/api/admin/calendar/${editEvent.id}`, editEvent);
        toast({ title: "Event updated" });
      } else {
        await authFetch("POST", "/api/admin/calendar", editEvent);
        toast({ title: "Event created" });
      }
      setIsDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const deleteEvent = async (id: number) => {
    await authFetch("DELETE", `/api/admin/calendar/${id}`);
    toast({ title: "Event deleted" });
    loadData();
  };

  const openEdit = (event?: CalendarEvent) => {
    setEditEvent(event ? { ...event } : { name: "", date: "", region: "global", category: "holiday", importance: 2, isRecurring: false, isActive: true });
    setIsDialogOpen(true);
  };

  const filtered = events.filter((e) => {
    if (filterRegion !== "all" && e.region !== filterRegion) return false;
    if (filterCategory !== "all" && e.category !== filterCategory) return false;
    if (searchQuery && !e.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const regions = [...new Set(events.map((e) => e.region))];
  const categories = [...new Set(events.map((e) => e.category))];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            Calendar & Holidays
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage holidays, events, and dates that power the Timeline Planner engine
          </p>
        </div>
        <Button onClick={() => openEdit()} className="gap-2" data-testid="button-add-event">
          <Plus className="w-4 h-4" />
          Add Event
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Events</p>
          </CardContent>
        </Card>
        {Object.entries(stats.byRegion).slice(0, 4).map(([region, count]) => (
          <Card key={region}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-muted-foreground">{region === "IL" ? "Israel" : region === "US" ? "United States" : region}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 flex items-center gap-3 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48"
            data-testid="input-search-events"
          />
          <Select value={filterRegion} onValueChange={setFilterRegion}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} events shown</span>
        </CardContent>
      </Card>

      {/* Events table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Importance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ev) => (
                  <TableRow key={ev.id} data-testid={`event-row-${ev.id}`}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{ev.name}</span>
                        {ev.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{ev.description}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {ev.date}
                      {ev.endDate && <span className="text-muted-foreground"> → {ev.endDate}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={regionColors[ev.region] || ""}>{ev.region}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={categoryColors[ev.category] || ""}>
                        {ev.category}
                        {ev.subcategory && <span className="opacity-60">/{ev.subcategory}</span>}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {ev.importance === 1 && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                      {ev.importance === 2 && <Star className="w-4 h-4 text-muted-foreground" />}
                      {ev.importance === 3 && <span className="text-xs text-muted-foreground">Minor</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(ev)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteEvent(ev.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editEvent?.id ? "Edit Event" : "Add Event"}</DialogTitle>
          </DialogHeader>
          {editEvent && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label>Event Name</Label>
                <Input value={editEvent.name || ""} onChange={(e) => setEditEvent({ ...editEvent, name: e.target.value })} data-testid="input-event-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input type="date" value={editEvent.date || ""} onChange={(e) => setEditEvent({ ...editEvent, date: e.target.value })} data-testid="input-event-date" />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date (optional)</Label>
                  <Input type="date" value={editEvent.endDate || ""} onChange={(e) => setEditEvent({ ...editEvent, endDate: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Region</Label>
                  <Select value={editEvent.region || "global"} onValueChange={(v) => setEditEvent({ ...editEvent, region: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="global">Global</SelectItem>
                      <SelectItem value="US">US</SelectItem>
                      <SelectItem value="IL">Israel</SelectItem>
                      <SelectItem value="UK">UK</SelectItem>
                      <SelectItem value="EU">EU</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select value={editEvent.category || "holiday"} onValueChange={(v) => setEditEvent({ ...editEvent, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="holiday">Holiday</SelectItem>
                      <SelectItem value="religious">Religious</SelectItem>
                      <SelectItem value="cultural">Cultural</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                      <SelectItem value="personal">Personal</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Importance</Label>
                  <Select value={String(editEvent.importance || 2)} onValueChange={(v) => setEditEvent({ ...editEvent, importance: parseInt(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Major</SelectItem>
                      <SelectItem value="2">Standard</SelectItem>
                      <SelectItem value="3">Minor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Subcategory</Label>
                <Input value={editEvent.subcategory || ""} onChange={(e) => setEditEvent({ ...editEvent, subcategory: e.target.value })} placeholder="e.g., jewish, federal, marketing" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={editEvent.description || ""} onChange={(e) => setEditEvent({ ...editEvent, description: e.target.value })} rows={2} />
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editEvent.isRecurring || false} onCheckedChange={(v) => setEditEvent({ ...editEvent, isRecurring: v })} />
                <Label>Recurring yearly</Label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={saveEvent} data-testid="button-save-event">Save Event</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
