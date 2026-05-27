import { useQuery } from "@tanstack/react-query";
import { useAuthFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox } from "lucide-react";

interface NotificationRow {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  projectId: number | null;
  read: boolean;
  createdAt: string;
}

export default function ApprovalsPage() {
  const { t, dir } = useI18n();
  // Approvals = chat_reply_approval notifications; the actual decision is via Telegram callback.
  const notifQ = useQuery<NotificationRow[]>({ queryKey: ["/api/notifications"] });

  const approvals = (notifQ.data || []).filter((n) => n.type === "chat_reply_approval" || n.type === "milestone_ready");

  return (
    <div className={`p-6 max-w-3xl mx-auto space-y-4 ${dir === "rtl" ? "text-right" : ""}`} dir={dir}>
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-approvals-title">
          <Inbox className="w-5 h-5" /> {t("approvals.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("approvals.subtitle")}</p>
      </div>

      {notifQ.isLoading ? (
        <Skeleton className="h-40" />
      ) : approvals.length === 0 ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">{t("approvals.empty")}</CardContent></Card>
      ) : (
        approvals.map((n) => (
          <Card key={n.id} data-testid={`card-approval-${n.id}`}>
            <CardHeader>
              <CardTitle className="text-base">{n.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {n.body && <div className="text-sm">{n.body}</div>}
              <div className="text-xs text-muted-foreground mt-2">{new Date(n.createdAt).toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">{t("approvals.respondViaTelegram")}</div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
