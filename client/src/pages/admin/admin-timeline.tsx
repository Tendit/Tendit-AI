import { useState, useEffect, useCallback } from "react";
import { useAuthFetch } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Activity, TrendingUp, Clock, ArrowLeft, BookOpen, Target,
  Smile, Frown, Meh, AlertTriangle, Flame, ChevronRight, Calendar,
  Tag, Zap, BrainCircuit, CheckCircle2, CircleDot, Search
} from "lucide-react";

interface UserWithEvents {
  userId: number;
  username: string;
  email: string;
  eventCount: number;
  lastEvent: string;
}

interface UserEvent {
  id: number;
  userId: number;
  conversationId: number | null;
  messageId: number | null;
  topic: string;
  summary: string;
  category: string;
  subcategory: string | null;
  phase: string | null;
  milestone: string | null;
  progressPct: number | null;
  sentiment: string | null;
  complexity: number | null;
  toolUsed: string | null;
  model: string | null;
  creditsUsed: number | null;
  tags: string | null;
  createdAt: string;
}

interface StoryArc {
  userId: number;
  username: string;
  totalEvents: number;
  firstEventDate: string;
  lastEventDate: string;
  activeDays: number;
  topTopics: { topic: string; count: number; lastSeen: string }[];
  activeProjects: {
    topic: string;
    category: string;
    phase: string;
    progressPct: number;
    eventCount: number;
    lastActivity: string;
    milestones: string[];
  }[];
  recentEvents: UserEvent[];
  sentimentTrend: { date: string; sentiment: string }[];
  narrativeSummary: string;
}

const SENTIMENT_CONFIG: Record<string, { icon: typeof Smile; color: string; bg: string }> = {
  positive: { icon: Smile, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950" },
  neutral: { icon: Meh, color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-50 dark:bg-slate-900" },
  negative: { icon: Frown, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950" },
  frustrated: { icon: AlertTriangle, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950" },
};

const PHASE_CONFIG: Record<string, { label: string; color: string }> = {
  discovery: { label: "Discovery", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  planning: { label: "Planning", color: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200" },
  execution: { label: "Execution", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  review: { label: "Review", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200" },
  completion: { label: "Complete", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
};

const CATEGORY_COLORS: Record<string, string> = {
  book: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  marketing: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  personal: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  code: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  research: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  business: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  creative: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200",
  education: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  general: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
};

function formatDate(d: string) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(d: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// User list view
function UserList({ onSelectUser }: { onSelectUser: (userId: number) => void }) {
  const authFetch = useAuthFetch();
  const [usersWithEvents, setUsersWithEvents] = useState<UserWithEvents[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    authFetch("GET", "/api/admin/timeline/users")
      .then((r) => r.json())
      .then((data) => setUsersWithEvents(data))
      .catch(() => setUsersWithEvents([]))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!usersWithEvents || usersWithEvents.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Activity className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No user events yet. Events are captured automatically from chat interactions.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {usersWithEvents.map((u) => (
        <button
          key={u.userId}
          onClick={() => onSelectUser(u.userId)}
          className="w-full text-left"
          data-testid={`user-select-${u.userId}`}
        >
          <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
            <CardContent className="py-3 px-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{u.username}</div>
                  <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-sm font-medium">{u.eventCount}</div>
                  <div className="text-xs text-muted-foreground">events</div>
                </div>
                <div className="text-right hidden sm:block">
                  <div className="text-xs text-muted-foreground">{timeAgo(u.lastEvent)}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </button>
      ))}
    </div>
  );
}

// Story arc detail view
function StoryArcView({ userId, onBack }: { userId: number; onBack: () => void }) {
  const authFetch = useAuthFetch();
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [arc, setArc] = useState<StoryArc | null>(null);
  const [arcLoading, setArcLoading] = useState(true);
  const [events, setEvents] = useState<UserEvent[] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(true);

  // Load arc
  useEffect(() => {
    setArcLoading(true);
    authFetch("GET", `/api/admin/timeline/${userId}/arc`)
      .then((r) => r.json())
      .then((data) => setArc(data))
      .catch(() => setArc(null))
      .finally(() => setArcLoading(false));
  }, [userId]);

  // Load events (re-fetch when category changes)
  useEffect(() => {
    setEventsLoading(true);
    const eventsUrl = categoryFilter === "all"
      ? `/api/admin/timeline/${userId}/events`
      : `/api/admin/timeline/${userId}/events?category=${categoryFilter}`;
    authFetch("GET", eventsUrl)
      .then((r) => r.json())
      .then((data) => setEvents(data))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [userId, categoryFilter]);

  if (arcLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!arc) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <p className="text-sm text-muted-foreground mt-4">No data found for this user.</p>
      </div>
    );
  }

  // Calculate sentiment distribution
  const sentimentCounts: Record<string, number> = {};
  (arc.sentimentTrend || []).forEach((s) => {
    sentimentCounts[s.sentiment] = (sentimentCounts[s.sentiment] || 0) + 1;
  });
  const totalSentiment = Object.values(sentimentCounts).reduce((a, b) => a + b, 0) || 1;

  // Get unique categories from events
  const allCategories = [...new Set((events || []).map((e) => e.category))].sort();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-lg font-semibold" data-testid="text-arc-username">{arc.username}</h2>
          <p className="text-xs text-muted-foreground">User Story Arc &middot; {arc.totalEvents} events &middot; {arc.activeDays} active days</p>
        </div>
      </div>

      {/* Narrative Summary */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-2">
            <BrainCircuit className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <p className="text-sm leading-relaxed" data-testid="text-narrative">{arc.narrativeSummary}</p>
          </div>
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <Activity className="w-5 h-5 mx-auto mb-1 text-primary" />
            <div className="text-xl font-bold">{arc.totalEvents}</div>
            <div className="text-xs text-muted-foreground">Total Events</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <Calendar className="w-5 h-5 mx-auto mb-1 text-primary" />
            <div className="text-xl font-bold">{arc.activeDays}</div>
            <div className="text-xs text-muted-foreground">Active Days</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <Target className="w-5 h-5 mx-auto mb-1 text-primary" />
            <div className="text-xl font-bold">{arc.activeProjects.length}</div>
            <div className="text-xs text-muted-foreground">Projects</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 px-4 text-center">
            <BookOpen className="w-5 h-5 mx-auto mb-1 text-primary" />
            <div className="text-xl font-bold">{arc.topTopics.length}</div>
            <div className="text-xs text-muted-foreground">Topics</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Projects */}
      {arc.activeProjects.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Flame className="w-4 h-4" /> Active Projects
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {arc.activeProjects.map((proj, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2" data-testid={`project-${i}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{proj.topic}</span>
                    <Badge variant="outline" className={CATEGORY_COLORS[proj.category] || CATEGORY_COLORS.general}>
                      {proj.category}
                    </Badge>
                  </div>
                  <Badge className={PHASE_CONFIG[proj.phase]?.color || "bg-slate-100 text-slate-800"}>
                    {PHASE_CONFIG[proj.phase]?.label || proj.phase}
                  </Badge>
                </div>
                {/* Progress bar */}
                {(proj.progressPct !== null && proj.progressPct > 0) && (
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className="bg-primary rounded-full h-1.5 transition-all"
                      style={{ width: `${proj.progressPct}%` }}
                    />
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{proj.eventCount} interactions</span>
                  <span>{timeAgo(proj.lastActivity)}</span>
                </div>
                {proj.milestones.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {proj.milestones.map((m, j) => (
                      <div key={j} className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="w-3 h-3" /> {m}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Sentiment Distribution */}
      {arc.sentimentTrend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Sentiment Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 flex-wrap">
              {Object.entries(sentimentCounts).sort((a, b) => b[1] - a[1]).map(([sent, count]) => {
                const config = SENTIMENT_CONFIG[sent] || SENTIMENT_CONFIG.neutral;
                const Icon = config.icon;
                const pct = Math.round((count / totalSentiment) * 100);
                return (
                  <div key={sent} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${config.bg}`}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className="text-sm font-medium capitalize">{sent}</span>
                    <span className="text-xs text-muted-foreground">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Topics */}
      {arc.topTopics.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Tag className="w-4 h-4" /> Top Topics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {arc.topTopics.map((t, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {t.topic} <span className="ml-1 opacity-60">({t.count})</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline Events */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4" /> Event Timeline
            </CardTitle>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-category-filter">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {allCategories.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : !events || events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No events found.</p>
          ) : (
            <div className="relative">
              {/* Vertical timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

              <div className="space-y-1">
                {events.map((ev, i) => {
                  const sentConfig = SENTIMENT_CONFIG[ev.sentiment || "neutral"] || SENTIMENT_CONFIG.neutral;
                  const SentIcon = sentConfig.icon;
                  let parsedTags: string[] = [];
                  try { parsedTags = ev.tags ? JSON.parse(ev.tags) : []; } catch {}

                  return (
                    <div key={ev.id} className="relative pl-10 py-2" data-testid={`event-${ev.id}`}>
                      {/* Timeline dot */}
                      <div className={`absolute left-2.5 top-3.5 w-3 h-3 rounded-full border-2 border-background ${
                        ev.milestone ? "bg-primary" : "bg-muted-foreground/30"
                      }`} />

                      <div className="border rounded-lg p-3 hover:bg-accent/30 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{ev.topic}</span>
                              <Badge variant="outline" className={`text-[10px] py-0 ${CATEGORY_COLORS[ev.category] || CATEGORY_COLORS.general}`}>
                                {ev.category}
                              </Badge>
                              {ev.phase && (
                                <Badge className={`text-[10px] py-0 ${PHASE_CONFIG[ev.phase]?.color || ""}`}>
                                  {PHASE_CONFIG[ev.phase]?.label || ev.phase}
                                </Badge>
                              )}
                              <SentIcon className={`w-3.5 h-3.5 ${sentConfig.color}`} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ev.summary}</p>
                            {ev.milestone && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" /> {ev.milestone}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-[11px] text-muted-foreground">{formatDate(ev.createdAt)}</div>
                            <div className="flex items-center gap-1 justify-end mt-0.5">
                              {ev.toolUsed && (
                                <Badge variant="outline" className="text-[10px] py-0">
                                  <Zap className="w-2.5 h-2.5 mr-0.5" />{ev.toolUsed}
                                </Badge>
                              )}
                              {ev.model && (
                                <span className="text-[10px] text-muted-foreground">{ev.model}</span>
                              )}
                            </div>
                            {ev.creditsUsed !== null && ev.creditsUsed > 0 && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">{ev.creditsUsed.toFixed(1)} cr</div>
                            )}
                          </div>
                        </div>
                        {parsedTags.length > 0 && (
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {parsedTags.map((tag, j) => (
                              <span key={j} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Main page
export default function AdminTimelinePage() {
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">User Timeline</h1>
          <p className="text-sm text-muted-foreground">
            {selectedUserId ? "User story arc and development timeline" : "Track user interactions, progress, and story arcs"}
          </p>
        </div>
      </div>

      {selectedUserId ? (
        <StoryArcView userId={selectedUserId} onBack={() => setSelectedUserId(null)} />
      ) : (
        <UserList onSelectUser={setSelectedUserId} />
      )}
    </div>
  );
}
