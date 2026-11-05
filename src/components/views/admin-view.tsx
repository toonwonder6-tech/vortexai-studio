"use client";
import { useEffect, useState } from "react";
import { PageHeader, SectionCard, StatCard, EmptyState } from "@/components/shared";
import { api, formatBytes, timeAgo } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import {
  Shield, Users, Activity, Cpu, HardDrive, Film, Image as ImageIcon,
  Sparkles, Mic, CheckCircle2, XCircle, Loader2, RefreshCw, Zap, Settings as SettingsIcon, AlertTriangle, Trash2, KeyRound, Server,
  Github, Globe, Lock,
} from "lucide-react";
import { toast } from "sonner";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function AdminView() {
  const { user } = useApp();
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api("/api/admin/stats"),
      api("/api/admin/settings"),
      api("/api/admin/users"),
      api("/api/admin/jobs?limit=50"),
    ]).then(([s, se, u, j]) => {
      if (s.ok) setStats(s.data);
      if (se.ok) setSettings(se.data.settings);
      if (u.ok) setUsers(u.data.users);
      if (j.ok) setJobs(j.data.jobs);
      setLoading(false);
    });
  }, []);

  if (user?.role !== "admin") {
    return (
      <div>
        <PageHeader title="Admin Panel" icon={<Shield className="h-5 w-5" />} />
        <EmptyState
          icon={<AlertTriangle className="h-6 w-6" />}
          title="Administrator access required"
          description="This area is restricted to platform administrators."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Admin Control Panel"
        description="Full control over the platform: API, users, generations, settings and analytics. The Z.ai API key is managed centrally and never exposed."
        icon={<Shield className="h-5 w-5" />}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 h-auto">
          <TabsTrigger value="overview" className="gap-1.5"><Activity className="h-3.5 w-3.5" /> Overview</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Users</TabsTrigger>
          <TabsTrigger value="jobs" className="gap-1.5"><Film className="h-3.5 w-3.5" /> Jobs</TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5"><SettingsIcon className="h-3.5 w-3.5" /> Settings</TabsTrigger>
          <TabsTrigger value="api" className="gap-1.5"><Cpu className="h-3.5 w-3.5" /> API</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab stats={stats} loading={loading} />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTab users={users} onChange={() => api("/api/admin/users").then((r) => r.ok && setUsers(r.data.users))} />
        </TabsContent>
        <TabsContent value="jobs" className="mt-4">
          <JobsTab jobs={jobs} onChange={() => api("/api/admin/jobs?limit=50").then((r) => r.ok && setJobs(r.data.jobs))} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4">
          {settings ? <SettingsTab key={JSON.stringify(settings).slice(0, 50)} settings={settings} onSave={setSettings} /> : (
            <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )}
        </TabsContent>
        <TabsContent value="api" className="mt-4">
          <ApiTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------- Overview ------------------------------- */

function OverviewTab({ stats, loading }: { stats: any; loading: boolean }) {
  if (loading || !stats) {
    return <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  const { totals, usageByType, usageByStatus, usageByModel, jobsByStatus, daily } = stats;

  const dailyData = (daily || []).slice().reverse().map((d: any) => ({
    day: String(d.day || "").slice(5),
    total: Number(d.total),
    success: Number(d.success),
    failed: Number(d.failed),
  }));

  const typeData = (usageByType || []).map((u: any) => ({ name: u.type, value: u._count }));
  const statusData = (usageByStatus || []).map((u: any) => ({ name: u.status, value: u._count }));
  const modelData = (usageByModel || []).map((u: any) => ({ name: u.model, value: u._count }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total users" value={totals.totalUsers} icon={<Users className="h-4 w-4" />} accent="primary" hint={`${totals.activeUsers7d} new in 7d`} />
        <StatCard label="Total jobs" value={totals.totalJobs} icon={<Film className="h-4 w-4" />} accent="chart-2" />
        <StatCard label="Total assets" value={totals.totalAssets} icon={<HardDrive className="h-4 w-4" />} accent="chart-3" hint={formatBytes(totals.storageBytes)} />
        <StatCard label="Projects" value={totals.totalProjects} icon={<Sparkles className="h-4 w-4" />} accent="chart-4" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="API requests (last 14 days)" description="Daily generation activity across all users.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="total" stroke="var(--chart-1)" fill="url(#g1)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Usage by type" description="Distribution of AI requests.">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={typeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} label>
                  {typeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <SectionCard title="Job status" description="All-time job outcomes.">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={jobsByStatus.map((j: any) => ({ name: j.status, value: j._count }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Most-used models" description="Top models by request count.">
          {modelData.length === 0 ? (
            <EmptyState title="No model usage yet" description="Model usage will appear here once generations start." />
          ) : (
            <div className="space-y-2">
              {modelData.map((m: any, i: number) => (
                <div key={m.name} className="flex items-center justify-between p-2 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <span className="grid place-items-center h-6 w-6 rounded-md bg-primary/10 text-primary text-xs font-bold">{i + 1}</span>
                    <code className="text-sm">{m.name}</code>
                  </div>
                  <Badge variant="secondary">{m.value}</Badge>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

/* -------------------------------- Users -------------------------------- */

function UsersTab({ users, onChange }: { users: any[]; onChange: () => void }) {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const filtered = search
    ? users.filter((u) => u.email.includes(search) || (u.name || "").includes(search))
    : users;

  async function update(id: string, data: any) {
    const r = await api("/api/admin/users", { method: "PATCH", body: JSON.stringify({ id, ...data }) });
    if (r.ok) { toast.success("User updated"); onChange(); }
    else toast.error(r.error || "Failed");
  }
  async function remove(id: string) {
    const r = await api(`/api/admin/users?id=${id}`, { method: "DELETE" });
    if (r.ok) { toast.success("User deleted"); onChange(); }
    else toast.error(r.error || "Failed");
  }

  return (
    <SectionCard
      title="User management"
      description={`${users.length} registered users`}
      actions={
        <Input placeholder="Search email or name…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
      }
    >
      <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Stats</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow key={u.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{u.name || "—"}</span>
                    <span className="text-xs text-muted-foreground">{u.email}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"}>{u.role}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={u.status === "active" ? "default" : "destructive"}>{u.status}</Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {u._count.projects} proj · {u._count.jobs} jobs · {u._count.assets} assets
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{timeAgo(u.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Select
                      value={u.role}
                      onValueChange={(v) => update(u.id, { role: v })}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">user</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={u.status} onValueChange={(v) => update(u.id, { status: v })}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">active</SelectItem>
                        <SelectItem value="suspended">suspended</SelectItem>
                      </SelectContent>
                    </Select>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete user?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently deletes {u.email} and all their data. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(u.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

/* -------------------------------- Jobs -------------------------------- */

function JobsTab({ jobs, onChange }: { jobs: any[]; onChange: () => void }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);

  async function act(id: string, action: "cancel" | "retry") {
    const r = await api("/api/admin/jobs", { method: "PATCH", body: JSON.stringify({ id, action }) });
    if (r.ok) { toast.success(`Job ${action}ed`); onChange(); }
    else toast.error(r.error || "Failed");
  }

  return (
    <SectionCard
      title="Generation monitoring"
      description={`${jobs.length} recent jobs across all users`}
      actions={
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Prompt</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((j) => (
              <TableRow key={j.id}>
                <TableCell><Badge variant="outline" className="capitalize">{j.type}</Badge></TableCell>
                <TableCell className="max-w-[260px] truncate text-sm">{j.prompt || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{j.user?.email}</TableCell>
                <TableCell><StatusBadge status={j.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{timeAgo(j.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {j.resultUrl && (
                      <Button size="sm" variant="ghost" asChild className="h-8">
                        <a href={j.resultUrl} target="_blank" rel="noreferrer">View</a>
                      </Button>
                    )}
                    {(j.status === "processing" || j.status === "submitted") && (
                      <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => act(j.id, "cancel")}>Cancel</Button>
                    )}
                    {j.status === "failed" && (
                      <Button size="sm" variant="ghost" className="h-8" onClick={() => act(j.id, "retry")}>Retry</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, any> = {
    completed: { variant: "default", icon: CheckCircle2 },
    failed: { variant: "destructive", icon: XCircle },
    processing: { variant: "secondary", icon: Loader2 },
    submitted: { variant: "secondary", icon: Loader2 },
    waiting: { variant: "secondary", icon: Loader2 },
  };
  const cfg = map[status] || { variant: "secondary", icon: Activity };
  const Icon = cfg.icon;
  const spinning = status === "processing" || status === "submitted" || status === "waiting";
  return (
    <Badge variant={cfg.variant} className="gap-1">
      <Icon className={`h-3 w-3 ${spinning ? "animate-spin" : ""}`} />
      {status}
    </Badge>
  );
}

/* ------------------------------- Settings ------------------------------ */

function SettingsTab({ settings, onSave }: { settings: any; onSave: (s: any) => void }) {
  const [form, setForm] = useState<any>(settings);

  async function save() {
    const r = await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify(form) });
    if (r.ok) { toast.success("Settings saved"); onSave(r.data.settings); }
    else toast.error(r.error || "Failed");
  }

  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      <SectionCard title="Platform controls" description="Maintenance mode and registration.">
        <div className="space-y-4">
          <Row label="Maintenance mode" desc="Temporarily disable all AI generation for non-admins.">
            <Switch checked={!!form.maintenanceMode} onCheckedChange={(v) => set("maintenanceMode", v)} />
          </Row>
          <Row label="Allow registration" desc="Let new users create free accounts.">
            <Switch checked={form.allowRegistration !== false} onCheckedChange={(v) => set("allowRegistration", v)} />
          </Row>
          <div className="space-y-2">
            <Label>Announcement banner</Label>
            <Input value={form.announcement || ""} onChange={(e) => set("announcement", e.target.value)} placeholder="Shown to all users in the dashboard (optional)" />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Fair-use limits" description="Protect the owner's API balance with reasonable caps. Free for all — but bounded.">
        <div className="grid sm:grid-cols-2 gap-4">
          <NumField label="Daily video limit / user" value={form.dailyVideoLimit} onChange={(v) => set("dailyVideoLimit", v)} />
          <NumField label="Daily image limit / user" value={form.dailyImageLimit} onChange={(v) => set("dailyImageLimit", v)} />
          <NumField label="Daily text limit / user" value={form.dailyTextLimit} onChange={(v) => set("dailyTextLimit", v)} />
          <NumField label="Max concurrent jobs / user" value={form.maxConcurrentJobs} onChange={(v) => set("maxConcurrentJobs", v)} />
          <NumField label="Storage limit / user (MB)" value={form.storageLimitMb} onChange={(v) => set("storageLimitMb", v)} />
          <NumField label="Max upload size (MB)" value={form.maxUploadMb} onChange={(v) => set("maxUploadMb", v)} />
        </div>
      </SectionCard>

      <SectionCard title="Default models" description="Centrally selected Z.ai models for each capability.">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Default text model</Label>
            <Input value={form.defaultTextModel || ""} onChange={(e) => set("defaultTextModel", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Default image model</Label>
            <Input value={form.defaultImageModel || ""} onChange={(e) => set("defaultImageModel", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Default video model</Label>
            <Input value={form.defaultVideoModel || ""} onChange={(e) => set("defaultVideoModel", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Default audio model</Label>
            <Input value={form.defaultAudioModel || ""} onChange={(e) => set("defaultAudioModel", e.target.value)} />
          </div>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={save} className="gap-2"><Zap className="h-4 w-4" /> Save all settings</Button>
      </div>
    </div>
  );
}

function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 border-b last:border-0">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      {children}
    </div>
  );
}
function NumField({ label, value, onChange }: { label: string; value: any; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

/* --------------------------------- API --------------------------------- */

function ApiTab() {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function test() {
    setTesting(true);
    const r = await api("/api/admin/test-api", { method: "POST" });
    setResult(r.ok ? r.data : { error: r.error });
    setTesting(false);
    toast(r.ok ? "API connection successful" : "API test failed", { description: r.ok ? `Latency: ${r.data.latencyMs}ms` : r.error });
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Z.ai API connectivity" description="The platform is powered exclusively by Z.ai. The API key is configured centrally via server environment variables and never exposed to the frontend.">
        <div className="flex items-center gap-3 mb-4">
          <div className="grid place-items-center h-10 w-10 rounded-lg bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">Credentials status</p>
            <p className="text-xs text-muted-foreground">Configured via ZAI_API_KEY / ZAI_BASE_URL on the server</p>
          </div>
        </div>
        <Button onClick={test} disabled={testing} className="gap-2">
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          Test API connectivity
        </Button>
        {result && (
          <div className="mt-4 p-4 rounded-lg border bg-muted/30">
            {result.error ? (
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-4 w-4" /> {result.error}
              </div>
            ) : (
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> Connection successful
                </div>
                <div className="text-muted-foreground">Reply: <code>{result.reply}</code></div>
                <div className="text-muted-foreground">Latency: {result.latencyMs}ms</div>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Model catalogue" description="The capabilities advertised to the studio UI.">
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { id: "glm-4.6", family: "text", icon: Sparkles, caps: ["text", "vision", "json"] },
            { id: "image-flash", family: "image", icon: ImageIcon, caps: ["text-to-image", "image-edit"] },
            { id: "cogvideox-2", family: "video", icon: Film, caps: ["text-to-video", "image-to-video", "multi-reference", "with-audio"] },
            { id: "cogtts", family: "audio", icon: Mic, caps: ["text-to-speech"] },
          ].map((m) => (
            <div key={m.id} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-2">
                <m.icon className="h-4 w-4 text-primary" />
                <code className="text-sm font-medium">{m.id}</code>
                <Badge variant="outline" className="ml-auto text-[10px]">{m.family}</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {m.caps.map((c) => <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>)}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Infrastructure" description="Backend services powering the platform.">
        <div className="grid sm:grid-cols-3 gap-3">
          <InfoTile icon={Server} title="Next.js API" value="Active" hint="App router · nodejs runtime" />
          <InfoTile icon={Server} title="Database" value="SQLite + Prisma" hint="Local persistent storage" />
          <InfoTile icon={Server} title="FFmpeg" value="Available" hint="Server-side video rendering" />
        </div>
      </SectionCard>

      {/* GitHub Upload */}
      <GitHubUploadSection />
    </div>
  );
}

function GitHubUploadSection() {
  const [token, setToken] = useState("");
  const [repoName, setRepoName] = useState("vortexai-studio");
  const [isPrivate, setIsPrivate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ url?: string; error?: string } | null>(null);

  async function upload() {
    if (!token.trim()) {
      toast.error("GitHub token is required.");
      return;
    }
    if (!repoName.trim()) {
      toast.error("Repository name is required.");
      return;
    }
    setUploading(true);
    setResult(null);
    toast.info("Uploading to GitHub — this may take a minute…");
    try {
      const r = await api("/api/admin/github-upload", {
        method: "POST",
        body: JSON.stringify({ token: token.trim(), repoName: repoName.trim(), isPrivate }),
      });
      if (r.ok && r.data?.url) {
        setResult({ url: r.data.url });
        toast.success("Uploaded to GitHub!");
      } else {
        setResult({ error: r.error || "Upload failed" });
        toast.error(r.error || "Upload failed");
      }
    } catch (err: any) {
      setResult({ error: err.message });
      toast.error("Upload failed: " + err.message);
    }
    setUploading(false);
  }

  return (
    <SectionCard
      title="Upload to GitHub"
      description="Push the entire application source code to a GitHub repository."
    >
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs space-y-1">
          <p className="font-semibold text-primary">How to get a GitHub token:</p>
          <ol className="text-muted-foreground space-y-0.5 ml-3 list-decimal">
            <li>Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)</li>
            <li>Click "Generate new token (classic)"</li>
            <li>Check the <strong>repo</strong> scope (full repository access)</li>
            <li>Click "Generate token" and copy the <code className="text-primary">ghp_...</code> token</li>
          </ol>
        </div>

        <div className="space-y-2">
          <Label>GitHub personal access token</Label>
          <Input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            className="font-mono text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Repository name</Label>
            <Input
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="vortexai-studio"
            />
          </div>
          <div className="space-y-2">
            <Label>Visibility</Label>
            <div className="flex items-center gap-2 h-9">
              <Button
                type="button"
                variant={!isPrivate ? "default" : "outline"}
                size="sm"
                onClick={() => setIsPrivate(false)}
                className="gap-1.5"
              >
                <Globe className="h-3.5 w-3.5" /> Public
              </Button>
              <Button
                type="button"
                variant={isPrivate ? "default" : "outline"}
                size="sm"
                onClick={() => setIsPrivate(true)}
                className="gap-1.5"
              >
                <Lock className="h-3.5 w-3.5" /> Private
              </Button>
            </div>
          </div>
        </div>

        <Button onClick={upload} disabled={uploading || !token.trim()} className="w-full gap-2">
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
          {uploading ? "Uploading…" : "Upload to GitHub"}
        </Button>

        {result?.url && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm">
            <p className="font-semibold text-emerald-600 dark:text-emerald-400 mb-1">✅ Upload successful!</p>
            <p>Repository: <a href={result.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">{result.url}</a></p>
          </div>
        )}
        {result?.error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm">
            <p className="font-semibold text-red-600 dark:text-red-400 mb-1">❌ Upload failed</p>
            <p className="text-muted-foreground">{result.error}</p>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          The upload creates a clean Git repository with all source code (excluding node_modules, storage, and build artifacts).
          The token is used only for this upload and is never stored.
        </p>
      </div>
    </SectionCard>
  );
}

function InfoTile({ icon: Icon, title, value, hint }: { icon: any; title: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{title}</span>
      </div>
      <p className="font-semibold">{value}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}
