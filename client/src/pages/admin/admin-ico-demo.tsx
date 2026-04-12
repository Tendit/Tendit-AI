import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/lib/i18n";
import {
  Cpu,
  Globe,
  Zap,
  TrendingUp,
  DollarSign,
  Server,
  Activity,
  BarChart3,
  Coins,
  Factory,
  Refrigerator,
  Home,
  Monitor,
  ArrowUpRight,
  ArrowDownRight,
  CircleDot,
  ArrowRight,
  ShieldCheck,
  Thermometer,
  Receipt,
  Wallet,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

// ——— Data Models ———

interface NodeData {
  id: string;
  name: string;
  type: "factory" | "datacenter" | "home_fridge" | "home_pc" | "gpu_farm";
  location: string;
  country: string;
  gpus: number;
  hashrate: number;
  status: "online" | "offline" | "syncing";
  earnings24h: number;
  uptime: number;
  // NEW: ROI & compensation fields
  electricityCostPerHour: number; // $/hour
  gpuUtilization: number; // 0-100
  jobsCompleted24h: number;
  coolingBonus: number; // % savings from environment
  rewardPerComputeUnit: number; // $/CU
  computeUnitsDelivered24h: number;
}

interface CoinMetrics {
  price: number;
  priceChange24h: number;
  marketCap: number;
  volume24h: number;
  circulatingSupply: number;
  totalSupply: number;
  blockHeight: number;
  blockTime: number;
  difficulty: number;
}

interface NetworkMetrics {
  totalNodes: number;
  activeNodes: number;
  totalGPUs: number;
  networkHashrate: number;
  totalComputeJobs24h: number;
  aiRequestsServed24h: number;
  totalRevenue24h: number;
  totalRevenueAllTime: number;
  energyEfficiency: number;
  // NEW
  totalPayoutsToProviders24h: number;
  totalPayoutsAllTime: number;
  platformFee24h: number;
  verifiedJobs24h: number;
  verificationChallenges24h: number;
  slashingEvents24h: number;
  avgRewardPerCU: number;
  totalComputeUnits24h: number;
}

interface PayoutEvent {
  id: string;
  timestamp: string;
  nodeId: string;
  nodeName: string;
  nodeType: NodeData["type"];
  computeUnits: number;
  jobType: string;
  amountUSD: number;
  amountToken: number;
  txHash: string;
}

const SEED_NODES: NodeData[] = [
  { id: "n1", name: "Ma'adanei HaTala Factory", type: "factory", location: "Bnei Brak", country: "IL", gpus: 16, hashrate: 48.2, status: "online", earnings24h: 342.5, uptime: 99.7, electricityCostPerHour: 0.83, gpuUtilization: 78, jobsCompleted24h: 4820, coolingBonus: 18, rewardPerComputeUnit: 0.0071, computeUnitsDelivered24h: 48240 },
  { id: "n2", name: "HaTala Cold Storage #2", type: "factory", location: "Ashdod", country: "IL", gpus: 8, hashrate: 24.1, status: "online", earnings24h: 168.3, uptime: 98.9, electricityCostPerHour: 0.42, gpuUtilization: 72, jobsCompleted24h: 2410, coolingBonus: 22, rewardPerComputeUnit: 0.0070, computeUnitsDelivered24h: 24100 },
  { id: "n3", name: "GPU Farm Alpha", type: "gpu_farm", location: "Frankfurt", country: "DE", gpus: 64, hashrate: 192.0, status: "online", earnings24h: 1284.0, uptime: 99.9, electricityCostPerHour: 4.48, gpuUtilization: 91, jobsCompleted24h: 19200, coolingBonus: 5, rewardPerComputeUnit: 0.0067, computeUnitsDelivered24h: 192000 },
  { id: "n4", name: "GPU Farm Beta", type: "gpu_farm", location: "Virginia", country: "US", gpus: 48, hashrate: 144.0, status: "online", earnings24h: 962.4, uptime: 99.5, electricityCostPerHour: 2.88, gpuUtilization: 88, jobsCompleted24h: 14400, coolingBonus: 5, rewardPerComputeUnit: 0.0067, computeUnitsDelivered24h: 144000 },
  { id: "n5", name: "Lati Fridge — Cohen", type: "home_fridge", location: "Tel Aviv", country: "IL", gpus: 1, hashrate: 2.8, status: "online", earnings24h: 18.6, uptime: 96.2, electricityCostPerHour: 0.05, gpuUtilization: 42, jobsCompleted24h: 280, coolingBonus: 15, rewardPerComputeUnit: 0.0066, computeUnitsDelivered24h: 2800 },
  { id: "n6", name: "Lati Fridge — Levy", type: "home_fridge", location: "Ramat Gan", country: "IL", gpus: 1, hashrate: 2.9, status: "online", earnings24h: 19.1, uptime: 97.8, electricityCostPerHour: 0.05, gpuUtilization: 45, jobsCompleted24h: 290, coolingBonus: 15, rewardPerComputeUnit: 0.0066, computeUnitsDelivered24h: 2900 },
  { id: "n7", name: "Lati Fridge — Mizrahi", type: "home_fridge", location: "Haifa", country: "IL", gpus: 1, hashrate: 2.7, status: "syncing", earnings24h: 12.4, uptime: 89.3, electricityCostPerHour: 0.05, gpuUtilization: 31, jobsCompleted24h: 180, coolingBonus: 15, rewardPerComputeUnit: 0.0066, computeUnitsDelivered24h: 1800 },
  { id: "n8", name: "Home PC — Berlin", type: "home_pc", location: "Berlin", country: "DE", gpus: 2, hashrate: 5.6, status: "online", earnings24h: 37.2, uptime: 94.1, electricityCostPerHour: 0.14, gpuUtilization: 53, jobsCompleted24h: 560, coolingBonus: 0, rewardPerComputeUnit: 0.0066, computeUnitsDelivered24h: 5600 },
  { id: "n9", name: "Home PC — NYC", type: "home_pc", location: "New York", country: "US", gpus: 3, hashrate: 8.4, status: "online", earnings24h: 56.1, uptime: 92.6, electricityCostPerHour: 0.21, gpuUtilization: 48, jobsCompleted24h: 840, coolingBonus: 0, rewardPerComputeUnit: 0.0067, computeUnitsDelivered24h: 8400 },
  { id: "n10", name: "Data Center Singapore", type: "datacenter", location: "Singapore", country: "SG", gpus: 128, hashrate: 384.0, status: "online", earnings24h: 2562.0, uptime: 99.95, electricityCostPerHour: 8.96, gpuUtilization: 94, jobsCompleted24h: 38400, coolingBonus: 8, rewardPerComputeUnit: 0.0067, computeUnitsDelivered24h: 384000 },
  { id: "n11", name: "GPU Farm Gamma", type: "gpu_farm", location: "London", country: "GB", gpus: 32, hashrate: 96.0, status: "online", earnings24h: 641.2, uptime: 99.3, electricityCostPerHour: 2.24, gpuUtilization: 86, jobsCompleted24h: 9600, coolingBonus: 5, rewardPerComputeUnit: 0.0067, computeUnitsDelivered24h: 96000 },
  { id: "n12", name: "Lati Fridge — Park", type: "home_fridge", location: "Seoul", country: "KR", gpus: 1, hashrate: 2.9, status: "online", earnings24h: 19.3, uptime: 97.1, electricityCostPerHour: 0.05, gpuUtilization: 44, jobsCompleted24h: 290, coolingBonus: 14, rewardPerComputeUnit: 0.0066, computeUnitsDelivered24h: 2900 },
  { id: "n13", name: "Factory Node — Osaka", type: "factory", location: "Osaka", country: "JP", gpus: 12, hashrate: 36.0, status: "online", earnings24h: 240.3, uptime: 99.1, electricityCostPerHour: 0.72, gpuUtilization: 74, jobsCompleted24h: 3600, coolingBonus: 16, rewardPerComputeUnit: 0.0067, computeUnitsDelivered24h: 36000 },
  { id: "n14", name: "Home PC — São Paulo", type: "home_pc", location: "São Paulo", country: "BR", gpus: 2, hashrate: 5.4, status: "offline", earnings24h: 0, uptime: 0, electricityCostPerHour: 0, gpuUtilization: 0, jobsCompleted24h: 0, coolingBonus: 0, rewardPerComputeUnit: 0, computeUnitsDelivered24h: 0 },
  { id: "n15", name: "Data Center Dubai", type: "datacenter", location: "Dubai", country: "AE", gpus: 96, hashrate: 288.0, status: "online", earnings24h: 1923.0, uptime: 99.8, electricityCostPerHour: 5.76, gpuUtilization: 92, jobsCompleted24h: 28800, coolingBonus: 6, rewardPerComputeUnit: 0.0067, computeUnitsDelivered24h: 288000 },
  { id: "n16", name: "Lati Fridge — Schmidt", type: "home_fridge", location: "Munich", country: "DE", gpus: 1, hashrate: 2.8, status: "online", earnings24h: 18.7, uptime: 95.5, electricityCostPerHour: 0.06, gpuUtilization: 41, jobsCompleted24h: 280, coolingBonus: 14, rewardPerComputeUnit: 0.0067, computeUnitsDelivered24h: 2800 },
  { id: "n17", name: "GPU Farm Delta", type: "gpu_farm", location: "Amsterdam", country: "NL", gpus: 40, hashrate: 120.0, status: "online", earnings24h: 801.6, uptime: 99.4, electricityCostPerHour: 2.80, gpuUtilization: 85, jobsCompleted24h: 12000, coolingBonus: 5, rewardPerComputeUnit: 0.0067, computeUnitsDelivered24h: 120000 },
  { id: "n18", name: "Lati Fridge — Wang", type: "home_fridge", location: "Shanghai", country: "CN", gpus: 1, hashrate: 2.8, status: "syncing", earnings24h: 11.2, uptime: 88.0, electricityCostPerHour: 0.04, gpuUtilization: 28, jobsCompleted24h: 160, coolingBonus: 14, rewardPerComputeUnit: 0.0066, computeUnitsDelivered24h: 1600 },
  { id: "n19", name: "Home PC — Toronto", type: "home_pc", location: "Toronto", country: "CA", gpus: 2, hashrate: 5.5, status: "online", earnings24h: 36.7, uptime: 93.8, electricityCostPerHour: 0.12, gpuUtilization: 50, jobsCompleted24h: 550, coolingBonus: 0, rewardPerComputeUnit: 0.0067, computeUnitsDelivered24h: 5500 },
  { id: "n20", name: "Factory Node — Istanbul", type: "factory", location: "Istanbul", country: "TR", gpus: 10, hashrate: 30.0, status: "online", earnings24h: 200.4, uptime: 98.6, electricityCostPerHour: 0.50, gpuUtilization: 70, jobsCompleted24h: 3000, coolingBonus: 12, rewardPerComputeUnit: 0.0067, computeUnitsDelivered24h: 30000 },
];

const INITIAL_COIN: CoinMetrics = {
  price: 3.47,
  priceChange24h: 12.8,
  marketCap: 347_000_000,
  volume24h: 18_400_000,
  circulatingSupply: 100_000_000,
  totalSupply: 500_000_000,
  blockHeight: 1_247_832,
  blockTime: 12.4,
  difficulty: 847_293_182,
};

const JOB_TYPES = ["Chat Inference", "Agent Pipeline", "Voice Transcription", "Document Summary", "Code Execution", "Image Generation", "Embedding Batch", "RAG Query", "Multi-Agent Chain", "Email AI"];

function generatePayoutFeed(nodes: NodeData[], coin: CoinMetrics): PayoutEvent[] {
  const events: PayoutEvent[] = [];
  const onlineNodes = nodes.filter((n) => n.status === "online");
  const now = Date.now();
  for (let i = 0; i < 15; i++) {
    const node = onlineNodes[Math.floor(Math.random() * onlineNodes.length)];
    const cu = Math.round(50 + Math.random() * 500);
    const amt = +(cu * (0.005 + Math.random() * 0.004)).toFixed(2);
    events.push({
      id: `p${i}`,
      timestamp: new Date(now - i * 47_000 - Math.random() * 30_000).toISOString(),
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      computeUnits: cu,
      jobType: JOB_TYPES[Math.floor(Math.random() * JOB_TYPES.length)],
      amountUSD: amt,
      amountToken: +(amt / coin.price).toFixed(2),
      txHash: `0x${Array.from({length: 12}, () => Math.floor(Math.random()*16).toString(16)).join("")}...`,
    });
  }
  return events;
}

// ——— Simulation Engine ———

function useSimulatedData() {
  const [nodes, setNodes] = useState<NodeData[]>(SEED_NODES);
  const [coin, setCoin] = useState<CoinMetrics>(INITIAL_COIN);
  const [network, setNetwork] = useState<NetworkMetrics>({
    totalNodes: 847, activeNodes: 812, totalGPUs: 4_218,
    networkHashrate: 12_640, totalComputeJobs24h: 1_847_293,
    aiRequestsServed24h: 2_384_012, totalRevenue24h: 42_318,
    totalRevenueAllTime: 12_847_000, energyEfficiency: 847.3,
    totalPayoutsToProviders24h: 29_623, totalPayoutsAllTime: 8_993_000,
    platformFee24h: 12_695, verifiedJobs24h: 1_842_107,
    verificationChallenges24h: 5_186, slashingEvents24h: 3,
    avgRewardPerCU: 0.0067, totalComputeUnits24h: 4_421_000,
  });
  const [payouts, setPayouts] = useState<PayoutEvent[]>([]);

  // Initialize payouts once
  useEffect(() => {
    setPayouts(generatePayoutFeed(SEED_NODES, INITIAL_COIN));
  }, []);

  const tick = useCallback(() => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        hashrate: n.status === "online" ? +(n.hashrate + (Math.random() - 0.48) * 0.6).toFixed(1) : n.hashrate,
        earnings24h: n.status === "online" ? +(n.earnings24h + (Math.random() - 0.3) * 2).toFixed(1) : n.earnings24h,
        gpuUtilization: n.status === "online" ? Math.min(100, Math.max(10, n.gpuUtilization + Math.round((Math.random() - 0.48) * 3))) : 0,
        jobsCompleted24h: n.status === "online" ? n.jobsCompleted24h + Math.round(Math.random() * 8) : 0,
        computeUnitsDelivered24h: n.status === "online" ? n.computeUnitsDelivered24h + Math.round(Math.random() * 80) : 0,
      }))
    );
    setCoin((prev) => ({
      ...prev,
      price: +(prev.price + (Math.random() - 0.45) * 0.02).toFixed(4),
      priceChange24h: +(prev.priceChange24h + (Math.random() - 0.48) * 0.3).toFixed(1),
      volume24h: Math.round(prev.volume24h + (Math.random() - 0.45) * 80_000),
      blockHeight: prev.blockHeight + (Math.random() > 0.7 ? 1 : 0),
      difficulty: Math.round(prev.difficulty + (Math.random() - 0.48) * 50_000),
    }));
    setNetwork((prev) => ({
      ...prev,
      activeNodes: Math.max(800, prev.activeNodes + Math.round((Math.random() - 0.45) * 3)),
      totalComputeJobs24h: prev.totalComputeJobs24h + Math.round(Math.random() * 120),
      aiRequestsServed24h: prev.aiRequestsServed24h + Math.round(Math.random() * 180),
      totalRevenue24h: +(prev.totalRevenue24h + Math.random() * 8).toFixed(0),
      networkHashrate: +(prev.networkHashrate + (Math.random() - 0.45) * 20).toFixed(0),
      energyEfficiency: +(prev.energyEfficiency + (Math.random() - 0.48) * 2).toFixed(1),
      totalPayoutsToProviders24h: +(prev.totalPayoutsToProviders24h + Math.random() * 6).toFixed(0),
      verifiedJobs24h: prev.verifiedJobs24h + Math.round(Math.random() * 100),
      verificationChallenges24h: prev.verificationChallenges24h + (Math.random() > 0.92 ? 1 : 0),
      totalComputeUnits24h: prev.totalComputeUnits24h + Math.round(Math.random() * 500),
    }));
  }, []);

  useEffect(() => {
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [tick]);

  // Refresh payout feed every 8s
  useEffect(() => {
    const id = setInterval(() => {
      setPayouts((prev) => {
        const onlineNodes = SEED_NODES.filter((n) => n.status === "online");
        const node = onlineNodes[Math.floor(Math.random() * onlineNodes.length)];
        const cu = Math.round(50 + Math.random() * 500);
        const amt = +(cu * (0.005 + Math.random() * 0.004)).toFixed(2);
        const newEvent: PayoutEvent = {
          id: `p${Date.now()}`,
          timestamp: new Date().toISOString(),
          nodeId: node.id, nodeName: node.name, nodeType: node.type,
          computeUnits: cu, jobType: JOB_TYPES[Math.floor(Math.random() * JOB_TYPES.length)],
          amountUSD: amt, amountToken: +(amt / INITIAL_COIN.price).toFixed(2),
          txHash: `0x${Array.from({length: 12}, () => Math.floor(Math.random()*16).toString(16)).join("")}...`,
        };
        return [newEvent, ...prev.slice(0, 14)];
      });
    }, 8000);
    return () => clearInterval(id);
  }, []);

  return { nodes, coin, network, payouts };
}

// ——— Utilities ———

function fmt(n: number, decimals = 0) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(decimals > 0 ? decimals : 1) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

function nodeIcon(type: NodeData["type"], className = "h-4 w-4") {
  switch (type) {
    case "factory": return <Factory className={className} />;
    case "datacenter": return <Server className={className} />;
    case "home_fridge": return <Refrigerator className={className} />;
    case "home_pc": return <Monitor className={className} />;
    case "gpu_farm": return <Cpu className={className} />;
  }
}

function statusColor(s: NodeData["status"]) {
  if (s === "online") return "bg-emerald-500";
  if (s === "syncing") return "bg-amber-500";
  return "bg-red-500";
}

function statusBadge(s: NodeData["status"]) {
  if (s === "online") return <Badge variant="outline" className="border-emerald-500 text-emerald-600 text-xs">Online</Badge>;
  if (s === "syncing") return <Badge variant="outline" className="border-amber-500 text-amber-600 text-xs">Syncing</Badge>;
  return <Badge variant="outline" className="border-red-500 text-red-600 text-xs">Offline</Badge>;
}

function MiniSparkline({ values, color = "#0d9488" }: { values: number[]; color?: string }) {
  const h = 32; const w = 120;
  const min = Math.min(...values); const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ");
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function generateSparkline(base: number, len = 20, volatility = 0.03) {
  const arr: number[] = [base * (1 - volatility * 5)];
  for (let i = 1; i < len; i++) arr.push(arr[i - 1] * (1 + (Math.random() - 0.42) * volatility));
  return arr;
}

// ——— Sub-components ———

function RevenueChart({ t }: { t: (k: string) => string }) {
  const days = [t("ico.mon"), t("ico.tue"), t("ico.wed"), t("ico.thu"), t("ico.fri"), t("ico.sat"), t("ico.sun")];
  const values = [32400, 35200, 38100, 36800, 41200, 39600, 42318];
  const max = Math.max(...values);
  return (
    <div className="flex items-end gap-2 h-36 mt-4" data-testid="revenue-chart">
      {days.map((day, i) => (
        <div key={day} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs text-muted-foreground">${fmt(values[i])}</span>
          <div className="w-full rounded-t-sm bg-teal-500/80" style={{ height: `${(values[i] / max) * 100}%`, minHeight: 4 }} />
          <span className="text-xs text-muted-foreground">{day}</span>
        </div>
      ))}
    </div>
  );
}

function NodeDonut({ nodes }: { nodes: NodeData[] }) {
  const counts: Record<string, { count: number; color: string; label: string }> = {
    factory: { count: 0, color: "#f59e0b", label: "Factories" },
    gpu_farm: { count: 0, color: "#6366f1", label: "GPU Farms" },
    datacenter: { count: 0, color: "#0d9488", label: "Data Centers" },
    home_fridge: { count: 0, color: "#ec4899", label: "Lati Fridges" },
    home_pc: { count: 0, color: "#8b5cf6", label: "Home PCs" },
  };
  nodes.forEach((n) => counts[n.type].count++);
  const total = nodes.length;
  let cumulative = 0;
  const slices = Object.entries(counts).map(([, v]) => {
    const start = cumulative / total; cumulative += v.count;
    return { ...v, start, end: cumulative / total };
  });
  function arcPath(sf: number, ef: number, r: number) {
    const sa = sf * Math.PI * 2 - Math.PI / 2, ea = ef * Math.PI * 2 - Math.PI / 2;
    const lg = ef - sf > 0.5 ? 1 : 0;
    return `M ${60 + r * Math.cos(sa)} ${60 + r * Math.sin(sa)} A ${r} ${r} 0 ${lg} 1 ${60 + r * Math.cos(ea)} ${60 + r * Math.sin(ea)}`;
  }
  return (
    <div className="flex items-center gap-4">
      <svg width={120} height={120} data-testid="node-donut">
        {slices.map((s, i) => s.count > 0 ? <path key={i} d={arcPath(s.start, s.end - 0.005, 50)} fill="none" stroke={s.color} strokeWidth="16" strokeLinecap="round" /> : null)}
        <text x="60" y="58" textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-lg font-bold">{total}</text>
        <text x="60" y="74" textAnchor="middle" className="fill-muted-foreground text-[10px]">visible</text>
      </svg>
      <div className="flex flex-col gap-1">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="font-medium">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ——— NEW: Token Flow Sankey ———
function TokenFlowDiagram({ network, t }: { network: NetworkMetrics; t: (k: string) => string }) {
  const totalRev = +network.totalRevenue24h;
  const providerPayout = +network.totalPayoutsToProviders24h;
  const platformFee = +network.platformFee24h;
  const providerPct = totalRev > 0 ? ((providerPayout / totalRev) * 100).toFixed(0) : "70";
  const platformPct = totalRev > 0 ? ((platformFee / totalRev) * 100).toFixed(0) : "30";

  return (
    <div className="space-y-4" data-testid="token-flow-diagram">
      {/* Flow steps */}
      <div className="flex items-center gap-0 text-xs overflow-x-auto">
        {/* Step 1: User pays */}
        <div className="flex flex-col items-center min-w-[120px]">
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-1.5">
            <Wallet className="h-5 w-5 text-blue-600" />
          </div>
          <span className="font-medium text-center">{t("ico.flowUserPays")}</span>
          <span className="text-muted-foreground text-center">${fmt(totalRev)}/24h</span>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        {/* Step 2: Platform */}
        <div className="flex flex-col items-center min-w-[120px]">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-1.5">
            <Receipt className="h-5 w-5 text-amber-600" />
          </div>
          <span className="font-medium text-center">{t("ico.flowPlatform")}</span>
          <span className="text-muted-foreground text-center">${fmt(platformFee)} ({platformPct}%)</span>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        {/* Step 3: Verification */}
        <div className="flex flex-col items-center min-w-[120px]">
          <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mb-1.5">
            <ShieldCheck className="h-5 w-5 text-purple-600" />
          </div>
          <span className="font-medium text-center">{t("ico.flowVerify")}</span>
          <span className="text-muted-foreground text-center">{fmt(network.verifiedJobs24h)} {t("ico.flowJobs")}</span>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        {/* Step 4: Provider Payout */}
        <div className="flex flex-col items-center min-w-[120px]">
          <div className="w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center mb-1.5">
            <DollarSign className="h-5 w-5 text-teal-600" />
          </div>
          <span className="font-medium text-center">{t("ico.flowProviderPayout")}</span>
          <span className="text-teal-600 font-semibold text-center">${fmt(providerPayout)} ({providerPct}%)</span>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
        {/* Step 5: Nodes */}
        <div className="flex flex-col items-center min-w-[120px]">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mb-1.5">
            <Server className="h-5 w-5 text-emerald-600" />
          </div>
          <span className="font-medium text-center">{t("ico.flowNodes")}</span>
          <span className="text-muted-foreground text-center">{network.activeNodes} {t("ico.active")}</span>
        </div>
      </div>
      {/* Reward formula */}
      <div className="bg-muted/50 rounded-lg p-3 text-xs font-mono text-center" data-testid="text-reward-formula">
        {t("ico.rewardFormula")}: <span className="text-teal-600 font-semibold">Payout = ComputeUnits × RewardRate × UptimeMultiplier × CoolingBonus</span>
      </div>
    </div>
  );
}

// ——— NEW: Payouts by Provider Type (stacked bar) ———
function PayoutsByTypeChart({ nodes, t }: { nodes: NodeData[]; t: (k: string) => string }) {
  const types: { key: NodeData["type"]; label: string; color: string }[] = [
    { key: "factory", label: t("ico.typeFactory"), color: "#f59e0b" },
    { key: "gpu_farm", label: t("ico.typeGPUFarm"), color: "#6366f1" },
    { key: "datacenter", label: t("ico.typeDC"), color: "#0d9488" },
    { key: "home_fridge", label: t("ico.typeFridge"), color: "#ec4899" },
    { key: "home_pc", label: t("ico.typePC"), color: "#8b5cf6" },
  ];
  const totals = types.map((tp) => {
    const sum = nodes.filter((n) => n.type === tp.key).reduce((s, n) => s + n.earnings24h, 0);
    return { ...tp, total: sum };
  });
  const grandTotal = totals.reduce((s, t) => s + t.total, 0) || 1;

  return (
    <div className="space-y-3" data-testid="payouts-by-type">
      {totals.map((tp) => (
        <div key={tp.key} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="flex items-center gap-1.5">
              {nodeIcon(tp.key, "h-3.5 w-3.5")}
              <span className="font-medium">{tp.label}</span>
            </span>
            <span className="text-muted-foreground">${tp.total.toFixed(0)} <span className="text-foreground font-medium">({((tp.total / grandTotal) * 100).toFixed(0)}%)</span></span>
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${(tp.total / grandTotal) * 100}%`, backgroundColor: tp.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ——— Main Page ———

export default function AdminICODemoPage() {
  const { t, dir } = useI18n();
  const { nodes, coin, network, payouts } = useSimulatedData();

  const priceHistory = useMemo(() => generateSparkline(coin.price, 20, 0.02), []);
  const hashrateHistory = useMemo(() => generateSparkline(network.networkHashrate, 20, 0.01), []);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto" dir={dir} data-testid="ico-demo-page">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-teal-500/10"><Coins className="h-6 w-6 text-teal-600" /></div>
          <div>
            <h1 className="text-xl font-bold" data-testid="ico-title">{t("ico.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("ico.subtitle")}</p>
          </div>
        </div>
      </div>

      {/* ——— Row 1: Coin Price + Key Metrics ——— */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="col-span-1 md:col-span-2" data-testid="card-coin-price">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" />{t("ico.coinPrice")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-bold" data-testid="text-coin-price">${coin.price.toFixed(4)}</div>
                <div className={`flex items-center gap-1 mt-1 text-sm font-medium ${coin.priceChange24h >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {coin.priceChange24h >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  {coin.priceChange24h >= 0 ? "+" : ""}{coin.priceChange24h}% (24h)
                </div>
              </div>
              <MiniSparkline values={priceHistory} color={coin.priceChange24h >= 0 ? "#10b981" : "#ef4444"} />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
              <div><div className="text-xs text-muted-foreground">{t("ico.marketCap")}</div><div className="font-semibold text-sm">${fmt(coin.marketCap)}</div></div>
              <div><div className="text-xs text-muted-foreground">{t("ico.volume24h")}</div><div className="font-semibold text-sm">${fmt(coin.volume24h)}</div></div>
              <div><div className="text-xs text-muted-foreground">{t("ico.supply")}</div><div className="font-semibold text-sm">{fmt(coin.circulatingSupply)} / {fmt(coin.totalSupply)}</div></div>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-block-info">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><BarChart3 className="h-4 w-4" />{t("ico.blockchain")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><div className="text-xs text-muted-foreground">{t("ico.blockHeight")}</div><div className="font-semibold text-lg" data-testid="text-block-height">#{coin.blockHeight.toLocaleString()}</div></div>
            <div><div className="text-xs text-muted-foreground">{t("ico.blockTime")}</div><div className="font-semibold">{coin.blockTime}s</div></div>
            <div><div className="text-xs text-muted-foreground">{t("ico.difficulty")}</div><div className="font-semibold">{fmt(coin.difficulty)}</div></div>
          </CardContent>
        </Card>
        <Card data-testid="card-network-pulse">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Activity className="h-4 w-4" />{t("ico.networkPulse")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><div className="text-xs text-muted-foreground">{t("ico.hashrate")}</div><div className="font-semibold text-lg">{fmt(+network.networkHashrate)} TH/s</div></div>
            <MiniSparkline values={hashrateHistory} />
            <div><div className="text-xs text-muted-foreground">{t("ico.efficiency")}</div><div className="font-semibold">{network.energyEfficiency} {t("ico.jobsPerKwh")}</div></div>
          </CardContent>
        </Card>
      </div>

      {/* ——— Row 2: Network Stats ——— */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card data-testid="card-total-nodes"><CardContent className="pt-4 pb-4"><div className="flex items-center gap-2 text-muted-foreground mb-1"><Globe className="h-4 w-4" /><span className="text-xs font-medium">{t("ico.totalNodes")}</span></div><div className="text-2xl font-bold">{network.totalNodes.toLocaleString()}</div><div className="text-xs text-emerald-600 font-medium mt-0.5">{network.activeNodes} {t("ico.active")}</div></CardContent></Card>
        <Card data-testid="card-total-gpus"><CardContent className="pt-4 pb-4"><div className="flex items-center gap-2 text-muted-foreground mb-1"><Cpu className="h-4 w-4" /><span className="text-xs font-medium">{t("ico.totalGPUs")}</span></div><div className="text-2xl font-bold">{network.totalGPUs.toLocaleString()}</div><div className="text-xs text-muted-foreground mt-0.5">{t("ico.acrossNetwork")}</div></CardContent></Card>
        <Card data-testid="card-ai-requests"><CardContent className="pt-4 pb-4"><div className="flex items-center gap-2 text-muted-foreground mb-1"><Zap className="h-4 w-4" /><span className="text-xs font-medium">{t("ico.aiRequests24h")}</span></div><div className="text-2xl font-bold">{fmt(network.aiRequestsServed24h)}</div><div className="text-xs text-muted-foreground mt-0.5">{fmt(network.totalComputeJobs24h)} {t("ico.computeJobs")}</div></CardContent></Card>
        <Card data-testid="card-revenue"><CardContent className="pt-4 pb-4"><div className="flex items-center gap-2 text-muted-foreground mb-1"><TrendingUp className="h-4 w-4" /><span className="text-xs font-medium">{t("ico.revenue24h")}</span></div><div className="text-2xl font-bold text-teal-600">${fmt(+network.totalRevenue24h)}</div><div className="text-xs text-muted-foreground mt-0.5">${fmt(network.totalRevenueAllTime)} {t("ico.allTime")}</div></CardContent></Card>
      </div>

      {/* ═══════ NEW SECTION: Token Flow & Compensation Model ═══════ */}
      <Card data-testid="card-token-flow">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-teal-600" />
            {t("ico.tokenFlowTitle")}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{t("ico.tokenFlowDesc")}</p>
        </CardHeader>
        <CardContent>
          <TokenFlowDiagram network={network} t={t} />
        </CardContent>
      </Card>

      {/* ═══════ NEW SECTION: Provider Payouts Dashboard ═══════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Payout summary cards */}
        <Card data-testid="card-provider-payouts-summary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><Wallet className="h-4 w-4 text-teal-600" />{t("ico.providerPayoutsTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground">{t("ico.paidToProviders24h")}</div>
              <div className="text-2xl font-bold text-teal-600" data-testid="text-payouts-24h">${fmt(+network.totalPayoutsToProviders24h)}</div>
              <div className="text-xs text-muted-foreground">${fmt(network.totalPayoutsAllTime)} {t("ico.allTime")}</div>
            </div>
            <div className="border-t pt-3 space-y-2">
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">{t("ico.avgRewardPerCU")}</span><span className="font-semibold">${network.avgRewardPerCU.toFixed(4)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">{t("ico.totalCU24h")}</span><span className="font-semibold">{fmt(network.totalComputeUnits24h)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">{t("ico.platformFee")}</span><span className="font-semibold">${fmt(+network.platformFee24h)} (30%)</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">{t("ico.providerShare")}</span><span className="font-semibold text-teal-600">${fmt(+network.totalPayoutsToProviders24h)} (70%)</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Payouts by provider type */}
        <Card data-testid="card-payouts-by-type">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("ico.payoutsByType")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PayoutsByTypeChart nodes={nodes} t={t} />
          </CardContent>
        </Card>

        {/* Proof-of-Useful-Work verification */}
        <Card data-testid="card-verification">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-purple-600" />{t("ico.verificationTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div>
              <div><div className="text-xs text-muted-foreground">{t("ico.verifiedJobs")}</div><div className="font-semibold text-lg">{fmt(network.verifiedJobs24h)}</div></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center"><Clock className="h-5 w-5 text-amber-600" /></div>
              <div><div className="text-xs text-muted-foreground">{t("ico.challenges")}</div><div className="font-semibold">{network.verificationChallenges24h.toLocaleString()}</div></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center"><XCircle className="h-5 w-5 text-red-500" /></div>
              <div><div className="text-xs text-muted-foreground">{t("ico.slashingEvents")}</div><div className="font-semibold">{network.slashingEvents24h}</div></div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2.5 text-xs text-muted-foreground mt-2">
              {t("ico.verificationExplainer")}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══════ NEW SECTION: Live Payout Feed ═══════ */}
      <Card data-testid="card-payout-feed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Receipt className="h-4 w-4 text-teal-600" />
            {t("ico.liveFeedTitle")}
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-start pb-2 font-medium">{t("ico.feedTime")}</th>
                  <th className="text-start pb-2 font-medium">{t("ico.feedNode")}</th>
                  <th className="text-start pb-2 font-medium">{t("ico.feedJobType")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.feedCU")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.feedAmountUSD")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.feedAmountToken")}</th>
                  <th className="text-end pb-2 font-medium">Tx</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-payout-${p.id}`}>
                    <td className="py-2 text-muted-foreground">{new Date(p.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</td>
                    <td className="py-2 font-medium flex items-center gap-1.5">{nodeIcon(p.nodeType, "h-3.5 w-3.5")}<span className="truncate max-w-[160px]">{p.nodeName}</span></td>
                    <td className="py-2"><Badge variant="secondary" className="text-[10px] font-normal">{p.jobType}</Badge></td>
                    <td className="py-2 text-end font-mono">{p.computeUnits}</td>
                    <td className="py-2 text-end font-medium text-teal-600">${p.amountUSD}</td>
                    <td className="py-2 text-end font-mono">{p.amountToken} AIC</td>
                    <td className="py-2 text-end font-mono text-muted-foreground text-[10px]">{p.txHash}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ═══════ NEW SECTION: Node ROI & Profitability ═══════ */}
      <Card data-testid="card-node-roi">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            {t("ico.nodeROITitle")}
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{t("ico.nodeROIDesc")}</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-start pb-2 font-medium">{t("ico.nodeName")}</th>
                  <th className="text-start pb-2 font-medium">{t("ico.type")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.gpuUtil")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.cuDelivered")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.electricityCost")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.grossEarnings")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.coolingBonus")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.netProfit")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.profitMargin")}</th>
                </tr>
              </thead>
              <tbody>
                {nodes.filter(n => n.status !== "offline").map((node) => {
                  const elecCost24h = node.electricityCostPerHour * 24;
                  const coolingDiscount = elecCost24h * (node.coolingBonus / 100);
                  const netElecCost = elecCost24h - coolingDiscount;
                  const netProfit = node.earnings24h - netElecCost;
                  const margin = node.earnings24h > 0 ? (netProfit / node.earnings24h) * 100 : 0;
                  return (
                    <tr key={node.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-roi-${node.id}`}>
                      <td className="py-2 font-medium flex items-center gap-1.5">{nodeIcon(node.type, "h-3.5 w-3.5")}<span className="truncate max-w-[160px]">{node.name}</span></td>
                      <td className="py-2 text-muted-foreground capitalize">{node.type.replace("_", " ")}</td>
                      <td className="py-2 text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${node.gpuUtilization > 70 ? "bg-emerald-500" : node.gpuUtilization > 40 ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${node.gpuUtilization}%` }} /></div>
                          <span className="font-mono">{node.gpuUtilization}%</span>
                        </div>
                      </td>
                      <td className="py-2 text-end font-mono">{fmt(node.computeUnitsDelivered24h)}</td>
                      <td className="py-2 text-end text-red-500">${netElecCost.toFixed(1)}</td>
                      <td className="py-2 text-end font-medium">${node.earnings24h.toFixed(1)}</td>
                      <td className="py-2 text-end">{node.coolingBonus > 0 ? <Badge variant="outline" className="border-blue-400 text-blue-600 text-[10px]"><Thermometer className="h-3 w-3 mr-0.5" />{node.coolingBonus}%</Badge> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-2 text-end font-semibold text-teal-600">${netProfit.toFixed(1)}</td>
                      <td className="py-2 text-end"><span className={`font-semibold ${margin > 80 ? "text-emerald-600" : margin > 50 ? "text-amber-600" : "text-red-500"}`}>{margin.toFixed(0)}%</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ——— Node Distribution + Revenue Chart ——— */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card data-testid="card-node-distribution">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("ico.nodeDistribution")}</CardTitle></CardHeader>
          <CardContent>
            <NodeDonut nodes={nodes} />
            <div className="mt-4 pt-3 border-t text-xs text-muted-foreground">{t("ico.showingSample")} {nodes.length} {t("ico.of")} {network.totalNodes} {t("ico.totalNodesLabel")}</div>
          </CardContent>
        </Card>
        <Card data-testid="card-weekly-revenue">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">{t("ico.weeklyRevenue")}</CardTitle></CardHeader>
          <CardContent><RevenueChart t={t} /></CardContent>
        </Card>
      </div>

      {/* ——— ICO Progress ——— */}
      <Card data-testid="card-ico-progress">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium flex items-center gap-2"><Coins className="h-4 w-4 text-teal-600" />{t("ico.icoProgress")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
            <div><div className="text-xs text-muted-foreground">{t("ico.phase")}</div><div className="font-semibold text-teal-600">Phase 2 — {t("ico.earlyAdopters")}</div></div>
            <div><div className="text-xs text-muted-foreground">{t("ico.tokensSold")}</div><div className="font-semibold">42.3M / 100M</div></div>
            <div><div className="text-xs text-muted-foreground">{t("ico.raised")}</div><div className="font-semibold text-teal-600">$14.7M</div></div>
            <div><div className="text-xs text-muted-foreground">{t("ico.investors")}</div><div className="font-semibold">2,847</div></div>
          </div>
          <Progress value={42.3} className="h-3" data-testid="ico-progress-bar" />
          <div className="flex justify-between text-xs text-muted-foreground mt-2"><span>42.3% {t("ico.sold")}</span><span>{t("ico.hardCap")}: $35M</span></div>
        </CardContent>
      </Card>

      {/* ——— Live Nodes Table ——— */}
      <Card data-testid="card-nodes-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2"><Server className="h-4 w-4" />{t("ico.liveNodes")} <Badge variant="secondary" className="text-xs">{t("ico.sampleOf")} {nodes.length}</Badge></CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-start pb-2 font-medium">{t("ico.status")}</th>
                  <th className="text-start pb-2 font-medium">{t("ico.nodeName")}</th>
                  <th className="text-start pb-2 font-medium">{t("ico.type")}</th>
                  <th className="text-start pb-2 font-medium">{t("ico.location")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.gpus")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.hashrateTh")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.earnings24hLabel")}</th>
                  <th className="text-end pb-2 font-medium">{t("ico.uptime")}</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((node) => (
                  <tr key={node.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-node-${node.id}`}>
                    <td className="py-2.5"><div className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${statusColor(node.status)} animate-pulse`} />{statusBadge(node.status)}</div></td>
                    <td className="py-2.5 font-medium flex items-center gap-2">{nodeIcon(node.type)}<span className="truncate max-w-[200px]">{node.name}</span></td>
                    <td className="py-2.5 text-muted-foreground capitalize">{node.type.replace("_", " ")}</td>
                    <td className="py-2.5 text-muted-foreground">{node.location}, {node.country}</td>
                    <td className="py-2.5 text-end font-medium">{node.gpus}</td>
                    <td className="py-2.5 text-end font-mono text-xs">{node.hashrate.toFixed(1)}</td>
                    <td className="py-2.5 text-end font-medium text-teal-600">${node.earnings24h.toFixed(1)}</td>
                    <td className="py-2.5 text-end"><span className={`font-medium ${node.uptime >= 95 ? "text-emerald-600" : node.uptime >= 80 ? "text-amber-600" : "text-red-500"}`}>{node.uptime}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-xs text-muted-foreground py-2" data-testid="text-demo-disclaimer">
        <CircleDot className="h-3 w-3 inline-block mr-1" />{t("ico.disclaimer")}
      </div>
    </div>
  );
}
