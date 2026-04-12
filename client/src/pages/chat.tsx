import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth, useAuthFetch } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, Plus, Trash2, Bot, User, Coins, Globe, FileText, Code, BarChart3, Sparkles, ArrowRight, Shield, Clock, CalendarDays, Paperclip, X, Image, Music, Film, Terminal, Search, FileOutput, Zap, Download, ExternalLink, CheckCircle2, XCircle, Loader2, BrainCircuit } from "lucide-react";
import { MODELS, PROVIDERS, AGENT_TOOLS, REAL_TOOLS, applyMargin } from "@shared/schema";
import type { AgentStep, AgentTool } from "@shared/schema";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Attachment {
  type: "image" | "audio" | "video";
  name: string;
  url: string;
  mimetype: string;
  size: number;
  previewUrl?: string; // local object URL for preview before send
}

interface Message {
  id: number;
  role: string;
  content: string;
  model?: string;
  provider?: string;
  creditsUsed?: number;
  citations?: string;
  toolUsed?: string;
  attachments?: string;
  createdAt: string;
}

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
}

const toolIcons: Record<string, any> = {
  search: Globe,
  document: FileText,
  code: Code,
  analyze: BarChart3,
  creative: Sparkles,
  timeline: CalendarDays,
};

export default function ChatPage() {
  const { user, refreshUser } = useAuth();
  const authFetch = useAuthFetch();
  const { t, dir } = useI18n();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("sonar");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [rateLimitError, setRateLimitError] = useState<string | null>(null);
  const [rateLimitRetry, setRateLimitRetry] = useState<number>(0);
  const [featuresEnabled, setFeaturesEnabled] = useState({ smartFollowups: true, agentTools: true });
  const [pendingFiles, setPendingFiles] = useState<Attachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [agentArtifacts, setAgentArtifacts] = useState<{ filename: string; url: string; mimetype: string }[]>([]);
  const [dynamicTools, setDynamicTools] = useState<AgentTool[]>(REAL_TOOLS);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadConversations(); loadFeatures(); loadDynamicTools(); }, []);

  const loadDynamicTools = async () => {
    try {
      const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
      const res = await fetch(`${API_BASE}/api/tools`);
      const data = await res.json();
      if (data.tools?.length > 0) setDynamicTools(data.tools);
    } catch {}
  };
  useEffect(() => {
    if (activeConvId) { loadMessages(activeConvId); setFollowUps([]); }
    else { setMessages([]); setFollowUps([]); }
  }, [activeConvId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Countdown for rate limit
  useEffect(() => {
    if (rateLimitRetry <= 0) { setRateLimitError(null); return; }
    const timer = setInterval(() => {
      setRateLimitRetry((v) => {
        if (v <= 1) { setRateLimitError(null); return 0; }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitRetry]);

  const loadFeatures = async () => {
    try {
      const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
      const res = await fetch(`${API_BASE}/api/settings/features`);
      const data = await res.json();
      setFeaturesEnabled(data);
    } catch {}
  };

  // File upload handlers
  const handleFileSelect = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter((f) => /^(image|audio|video)\//.test(f.type));
    if (validFiles.length === 0) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      validFiles.forEach((f) => formData.append("files", f));

      const res = await authFetch("POST", "/api/upload", formData, true);
      const data = await res.json();

      if (data.files) {
        const newAttachments: Attachment[] = data.files.map((f: any, idx: number) => ({
          ...f,
          previewUrl: f.type === "image" ? URL.createObjectURL(validFiles[idx]) : undefined,
        }));
        setPendingFiles((prev) => [...prev, ...newAttachments].slice(0, 5));
      }
    } catch (err) {
      console.error("Upload failed:", err);
    }
    setIsUploading(false);
  }, [authFetch]);

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => {
      const removed = prev[index];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, [handleFileSelect]);

  const loadConversations = async () => {
    setIsLoading(true);
    try {
      const res = await authFetch("GET", "/api/conversations");
      setConversations(await res.json());
    } catch {}
    setIsLoading(false);
  };

  const loadMessages = async (convId: number) => {
    try {
      const res = await authFetch("GET", `/api/conversations/${convId}/messages`);
      setMessages(await res.json());
    } catch {}
  };

  // Agent mode SSE sender
  const sendAgentMessage = async (userMessage: string, currentAttachments: Attachment[]) => {
    const attachmentsJson = currentAttachments.length > 0 ? JSON.stringify(currentAttachments.map(a => ({ type: a.type, name: a.name, url: a.url, mimetype: a.mimetype, size: a.size }))) : undefined;
    const tempUserMsg: Message = { id: Date.now(), role: "user", content: userMessage, attachments: attachmentsJson, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, tempUserMsg]);
    setAgentSteps([]);
    setAgentArtifacts([]);

    const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
    const token = (window as any).__AUTH_TOKEN__;

    try {
      const res = await fetch(`${API_BASE}/api/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: userMessage,
          conversationId: activeConvId,
          model,
          attachments: currentAttachments.map(a => ({ type: a.type, name: a.name, url: a.url, mimetype: a.mimetype, size: a.size })),
          agentMode: true,
        }),
      });

      if (!res.ok && !res.headers.get("content-type")?.includes("text/event-stream")) {
        const err = await res.json();
        throw new Error(err.message || "Agent request failed");
      }

      // Parse SSE stream
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          let currentEvent = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith("data: ") && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6));
                if (currentEvent === "step") {
                  setAgentSteps((prev) => [...prev, data]);
                } else if (currentEvent === "done") {
                  if (!activeConvId && data.conversationId) {
                    setActiveConvId(data.conversationId);
                    loadConversations();
                  }
                  setMessages((prev) => [
                    ...prev.filter((m) => m.id !== tempUserMsg.id),
                    { ...tempUserMsg, id: data.message.id - 1 },
                    data.message,
                  ]);
                  if (data.artifacts) setAgentArtifacts(data.artifacts);
                  refreshUser();
                } else if (currentEvent === "error") {
                  setMessages((prev) => [...prev, { id: Date.now() + 1, role: "assistant", content: `Error: ${data.message}`, createdAt: new Date().toISOString() }]);
                }
              } catch {}
              currentEvent = "";
            }
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "assistant", content: `Error: ${err.message || "Agent request failed"}`, createdAt: new Date().toISOString() }]);
    }
    setIsSending(false);
    setAgentSteps([]);
  };

  const sendMessage = async (messageOverride?: string) => {
    const userMessage = (messageOverride || input).trim();
    if (!userMessage || isSending) return;
    const currentAttachments = [...pendingFiles];
    setInput("");
    setPendingFiles([]);
    setIsSending(true);
    setFollowUps([]);
    setRateLimitError(null);

    // Agent mode: use SSE endpoint
    if (agentMode) {
      return sendAgentMessage(userMessage, currentAttachments);
    }

    const attachmentsJson = currentAttachments.length > 0 ? JSON.stringify(currentAttachments.map(a => ({ type: a.type, name: a.name, url: a.url, mimetype: a.mimetype, size: a.size }))) : undefined;
    const tempUserMsg: Message = { id: Date.now(), role: "user", content: userMessage, attachments: attachmentsJson, createdAt: new Date().toISOString() };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await authFetch("POST", "/api/chat", {
        message: userMessage,
        conversationId: activeConvId,
        model,
        tool: activeTool,
        attachments: currentAttachments.map(a => ({ type: a.type, name: a.name, url: a.url, mimetype: a.mimetype, size: a.size })),
      });

      if (res.status === 429) {
        const data = await res.json();
        setRateLimitError(data.message);
        setRateLimitRetry(data.retryAfter || 60);
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
        setInput(userMessage);
        setIsSending(false);
        return;
      }

      const data = await res.json();

      if (!activeConvId) {
        setActiveConvId(data.conversationId);
        loadConversations();
      }

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMsg.id),
        { ...tempUserMsg, id: data.message.id - 1 },
        data.message,
      ]);
      refreshUser();

      // Set follow-up suggestions
      if (data.followUps?.length > 0) {
        setFollowUps(data.followUps);
      }
    } catch (err: any) {
      let msg = "Failed to send message";
      try {
        const parsed = JSON.parse(err.message);
        msg = parsed.message || msg;
        if (parsed.retryAfter) {
          setRateLimitError(msg);
          setRateLimitRetry(parsed.retryAfter);
        }
      } catch {}
      setMessages((prev) => [...prev, { id: Date.now() + 1, role: "assistant", content: `Error: ${msg}`, createdAt: new Date().toISOString() }]);
    }
    setIsSending(false);
  };

  const newConversation = () => { setActiveConvId(null); setMessages([]); setFollowUps([]); };

  const deleteConversation = async (id: number) => {
    try {
      await authFetch("DELETE", `/api/conversations/${id}`);
      if (activeConvId === id) { setActiveConvId(null); setMessages([]); }
      loadConversations();
    } catch {}
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const [multiplier, setMultiplier] = useState(1);
  useEffect(() => {
    const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
    fetch(`${API_BASE}/api/settings/margin`)
      .then((r) => r.json())
      .then((d) => setMultiplier(d.multiplier || 1))
      .catch(() => {});
  }, []);

  // Helper to render attachments in messages
  const renderAttachments = (attachmentsStr: string | undefined) => {
    if (!attachmentsStr) return null;
    try {
      const atts = JSON.parse(attachmentsStr) as Attachment[];
      if (!atts || atts.length === 0) return null;
      const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
      return (
        <div className="flex flex-wrap gap-2 mb-2">
          {atts.map((att, i) => {
            const fullUrl = `${API_BASE}${att.url}`;
            if (att.type === "image") {
              return (
                <a key={i} href={fullUrl} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={fullUrl}
                    alt={att.name}
                    className="max-w-[240px] max-h-[180px] rounded-md object-cover border"
                    data-testid={`attachment-image-${i}`}
                  />
                </a>
              );
            }
            if (att.type === "audio") {
              return (
                <audio key={i} controls className="max-w-[280px]" data-testid={`attachment-audio-${i}`}>
                  <source src={fullUrl} type={att.mimetype} />
                </audio>
              );
            }
            if (att.type === "video") {
              return (
                <video key={i} controls className="max-w-[320px] max-h-[200px] rounded-md" data-testid={`attachment-video-${i}`}>
                  <source src={fullUrl} type={att.mimetype} />
                </video>
              );
            }
            return null;
          })}
        </div>
      );
    } catch {
      return null;
    }
  };

  const selectedModel = MODELS.find((m) => m.id === model);
  const providerColor: Record<string, string> = {
    perplexity: "text-teal-600 dark:text-teal-400",
    anthropic: "text-orange-600 dark:text-orange-400",
    openai: "text-green-600 dark:text-green-400",
    google: "text-blue-600 dark:text-blue-400",
  };

  const toolBadgeColor: Record<string, string> = {
    search: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    document: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    code: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    analyze: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    creative: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
    timeline: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  };

  return (
    <div className={`flex h-full ${dir === "rtl" ? "flex-row-reverse" : ""}`}>
      {/* Conversation sidebar */}
      <div className={`w-64 bg-card flex flex-col shrink-0 ${dir === "rtl" ? "border-l" : "border-r"}`}>
        <div className="p-3 border-b">
          <Button onClick={newConversation} className="w-full gap-2" variant="outline" size="sm" data-testid="button-new-chat">
            <Plus className="w-4 h-4" />
            {t("chat.newChat")}
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-sm transition-colors ${
                  activeConvId === conv.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                }`}
                onClick={() => setActiveConvId(conv.id)}
                data-testid={`conv-item-${conv.id}`}
              >
                <span className="truncate flex-1">{conv.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Chat area */}
      <div
        className={`flex-1 flex flex-col min-w-0 relative ${isDragOver ? "ring-2 ring-primary ring-inset bg-primary/5" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-primary">
              <Paperclip className="w-10 h-10" />
              <p className="text-lg font-medium">{t("chat.dropFiles")}</p>
              <p className="text-sm text-muted-foreground">{t("chat.dropFilesDesc")}</p>
            </div>
          </div>
        )}
        {/* Header with model selector + tool selector */}
        <div className="flex items-center justify-between px-4 py-2 border-b gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-52" data-testid="select-model">
                <SelectValue>
                  {selectedModel && (
                    <span className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${providerColor[selectedModel.provider]}`}>
                        {selectedModel.provider.charAt(0).toUpperCase() + selectedModel.provider.slice(1)}
                      </span>
                      <span>{selectedModel.name}</span>
                      <span className="text-xs text-muted-foreground">({applyMargin(selectedModel.cost, multiplier)} cr)</span>
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((provider) => {
                  const providerModels = MODELS.filter((m) => m.provider === provider.id);
                  if (providerModels.length === 0) return null;
                  return (
                    <SelectGroup key={provider.id}>
                      <SelectLabel className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: provider.color }} />
                        {provider.name}
                      </SelectLabel>
                      {providerModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <div className="flex items-center justify-between gap-4 w-full">
                            <span>{m.name}</span>
                            <span className="text-xs text-muted-foreground">{applyMargin(m.cost, multiplier)} cr · {m.category}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Agent Mode toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { setAgentMode(!agentMode); setActiveTool(null); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    agentMode
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-violet-500 shadow-md shadow-violet-500/20"
                      : "bg-background text-muted-foreground border-border hover:border-violet-400 hover:text-violet-600"
                  }`}
                  data-testid="toggle-agent-mode"
                >
                  <BrainCircuit className="w-3.5 h-3.5" />
                  {t("chat.agentMode")}
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="font-medium">{t("chat.agentMode")}</p>
                <p className="text-xs opacity-75">{t("chat.agentModeDesc")}</p>
              </TooltipContent>
            </Tooltip>

            <Badge variant="outline" className="gap-1">
              <Coins className="w-3 h-3" />
              {user?.credits?.toFixed(1)} {t("chat.credits")}
            </Badge>
          </div>
        </div>

        {/* Agent Mode info bar */}
        {agentMode && (
          <div className="flex items-center gap-2 px-4 py-2 border-b bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 overflow-x-auto">
            <BrainCircuit className="w-4 h-4 text-violet-600 dark:text-violet-400 shrink-0" />
            <span className="text-xs font-medium text-violet-700 dark:text-violet-300 shrink-0">{t("chat.agentTools")}</span>
            {dynamicTools.map((tool) => {
              const iconMap: Record<string, any> = { run_code: Terminal, browse_web: Globe, generate_file: FileOutput, search_web: Search, analyze_data: BarChart3 };
              const Icon = iconMap[tool.id] || Zap;
              return (
                <span key={tool.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 whitespace-nowrap">
                  <Icon className="w-3 h-3" />
                  {tool.name}
                </span>
              );
            })}
          </div>
        )}

        {/* Agent tools bar (legacy, hidden in agent mode) */}
        {featuresEnabled.agentTools && !agentMode && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b bg-muted/30 overflow-x-auto">
            <span className="text-xs text-muted-foreground shrink-0 mr-1">{t("chat.tools")}:</span>
            {AGENT_TOOLS.map((tool) => {
              const Icon = toolIcons[tool.id] || Sparkles;
              const isActive = activeTool === tool.id;
              return (
                <Tooltip key={tool.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setActiveTool(isActive ? null : tool.id)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-background border hover:bg-accent hover:text-accent-foreground"
                      }`}
                      data-testid={`tool-${tool.id}`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tool.name}</span>
                      {isActive && (
                        <span className="text-[10px] opacity-75">{tool.creditMultiplier}x</span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{tool.name}</p>
                    <p className="text-xs opacity-75">{tool.description}</p>
                    <p className="text-xs mt-1">+{((tool.creditMultiplier - 1) * 100).toFixed(0)}% credit cost</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}

        {/* Rate limit warning */}
        {rateLimitError && (
          <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-sm text-destructive">
            <Shield className="w-4 h-4 shrink-0" />
            <span className="flex-1">{rateLimitError}</span>
            {rateLimitRetry > 0 && (
              <span className="flex items-center gap-1 text-xs font-mono shrink-0">
                <Clock className="w-3 h-3" />
                {rateLimitRetry}s
              </span>
            )}
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 p-4">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 py-20">
              <Bot className="w-12 h-12 opacity-50" />
              <p className="text-lg font-medium">{t("chat.startConversation")}</p>
              <p className="text-sm">{t("chat.chooseModel")}</p>
            </div>
          )}

          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? (dir === "rtl" ? "justify-start" : "justify-end") : (dir === "rtl" ? "justify-end" : "")}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div
                  className={`rounded-lg px-4 py-3 max-w-[80%] ${
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"
                  }`}
                  data-testid={`message-${msg.id}`}
                >
                  {msg.role === "user" && renderAttachments(msg.attachments)}
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  )}
                  {msg.role === "assistant" && (msg.model || msg.creditsUsed || msg.toolUsed) && (
                    <div className="flex items-center gap-2 mt-2 text-xs opacity-60 flex-wrap">
                      {msg.model && <span className="capitalize">{msg.model}</span>}
                      {msg.toolUsed && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${toolBadgeColor[msg.toolUsed] || "bg-muted"}`}>
                          {AGENT_TOOLS.find((t) => t.id === msg.toolUsed)?.name || msg.toolUsed}
                        </span>
                      )}
                      {msg.creditsUsed !== undefined && msg.creditsUsed > 0 && (
                        <span className="flex items-center gap-1"><Coins className="w-3 h-3" />{msg.creditsUsed} cr</span>
                      )}
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-foreground/10 flex items-center justify-center shrink-0 mt-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {/* Agent steps display */}
            {isSending && agentMode && agentSteps.length > 0 && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0 mt-1">
                  <BrainCircuit className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1 space-y-1.5 bg-card border rounded-lg p-3" data-testid="agent-steps">
                  {agentSteps.map((step, i) => {
                    const stepIconMap: Record<string, any> = { thinking: Loader2, tool_call: Zap, tool_result: CheckCircle2, response: Bot };
                    const StepIcon = stepIconMap[step.type] || Zap;
                    const isLast = i === agentSteps.length - 1;
                    return (
                      <div key={i} className={`flex items-start gap-2 text-xs ${isLast ? "text-foreground" : "text-muted-foreground"}`}>
                        <StepIcon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                          step.type === "thinking" ? "animate-spin text-violet-500" :
                          step.type === "tool_call" ? "text-amber-500" :
                          step.type === "tool_result" ? (step.toolResult?.success ? "text-green-500" : "text-red-500") :
                          "text-primary"
                        }`} />
                        <span className="leading-relaxed">{step.content}</span>
                      </div>
                    );
                  })}
                  {agentSteps[agentSteps.length - 1]?.type !== "response" && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
                      <span>{t("chat.processing")}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Artifacts display */}
            {agentArtifacts.length > 0 && !isSending && (
              <div className="flex gap-3">
                <div className="w-7 h-7" />
                <div className="flex flex-wrap gap-2" data-testid="agent-artifacts">
                  {agentArtifacts.map((art, i) => {
                    const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
                    return (
                      <a
                        key={i}
                        href={`${API_BASE}${art.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card hover:bg-accent transition-colors text-sm group"
                        data-testid={`artifact-${i}`}
                      >
                        <FileOutput className="w-4 h-4 text-violet-500" />
                        <span className="font-medium truncate max-w-[200px]">{art.filename}</span>
                        <Download className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
                      </a>
                    );
                  })}
                </div>
              </div>
            )}

            {isSending && !agentMode && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            )}

            {isSending && agentMode && agentSteps.length === 0 && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0 mt-1">
                  <BrainCircuit className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
                    <span>{t("chat.agentThinking")}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Follow-up suggestions */}
            {followUps.length > 0 && !isSending && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-muted-foreground font-medium">{t("chat.suggestedFollowups")}</p>
                <div className="flex flex-wrap gap-2">
                  {followUps.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(q)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border bg-background hover:bg-accent hover:text-accent-foreground transition-colors text-left"
                      data-testid={`followup-${i}`}
                    >
                      <ArrowRight className={`w-3 h-3 shrink-0 text-primary ${dir === "rtl" ? "rotate-180" : ""}`} />
                      <span className="line-clamp-1">{q}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t">
          <div className="max-w-3xl mx-auto">
            {activeTool && (
              <div className="flex items-center gap-2 mb-2 text-xs">
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${toolBadgeColor[activeTool] || "bg-muted"}`}>
                  {(() => { const Icon = toolIcons[activeTool]; return Icon ? <Icon className="w-3 h-3" /> : null; })()}
                  {AGENT_TOOLS.find((t) => t.id === activeTool)?.name}
                </span>
                <span className="text-muted-foreground">{t("chat.active")}</span>
              </div>
            )}

            {/* Pending file previews */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 p-2 rounded-lg bg-muted/50 border" data-testid="pending-files">
                {pendingFiles.map((file, i) => (
                  <div key={i} className="relative group">
                    {file.type === "image" && file.previewUrl ? (
                      <img src={file.previewUrl} alt={file.name} className="w-16 h-16 rounded-md object-cover border" />
                    ) : (
                      <div className="w-16 h-16 rounded-md border bg-muted flex flex-col items-center justify-center gap-1">
                        {file.type === "audio" ? <Music className="w-5 h-5 text-muted-foreground" /> : <Film className="w-5 h-5 text-muted-foreground" />}
                        <span className="text-[9px] text-muted-foreground truncate max-w-[56px] px-1">{file.name}</span>
                      </div>
                    )}
                    <button
                      onClick={() => removePendingFile(i)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      data-testid={`remove-file-${i}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {isUploading && (
                  <div className="w-16 h-16 rounded-md border bg-muted flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,audio/*,video/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) handleFileSelect(e.target.files);
                  e.target.value = "";
                }}
                data-testid="input-file-upload"
              />

              {/* Paperclip button */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0 h-11 w-11"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || pendingFiles.length >= 5}
                    data-testid="button-attach-file"
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("chat.attachTooltip")}</TooltipContent>
              </Tooltip>

              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={activeTool ? `${t("chat.askWith")} ${AGENT_TOOLS.find((tt) => tt.id === activeTool)?.name}...` : t("chat.askAnything")}
                className="min-h-[44px] max-h-[200px] resize-none"
                rows={1}
                data-testid="input-chat-message"
              />
              <Button
                onClick={() => sendMessage()}
                disabled={(!input.trim() && pendingFiles.length === 0) || isSending || rateLimitRetry > 0}
                size="icon"
                className="shrink-0 h-11 w-11"
                data-testid="button-send-message"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
