"use client";
import { useApp, ViewId } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Clapperboard, Image, Wand2, FileText, Film,
  Scissors, Mic, LayoutTemplate, Users, FolderOpen, Settings,
  Shield, Sparkles, Music, LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  group?: string;
  badge?: string;
  admin?: boolean;
}

const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { id: "video-generator", label: "AI Video Generator", icon: Clapperboard, group: "Create" },
  { id: "image-generator", label: "AI Image Generator", icon: Image, group: "Create" },
  { id: "ai-director", label: "AI Director", icon: Wand2, group: "Create", badge: "Signature" },
  { id: "music-video", label: "Music Video", icon: Music, group: "Create", badge: "New" },
  { id: "script-generator", label: "Script Generator", icon: FileText, group: "Create" },
  { id: "storyboard", label: "Storyboard", icon: Film, group: "Create" },
  { id: "voice-studio", label: "AI Voice Studio", icon: Mic, group: "Create" },
  { id: "prompt-assistant", label: "Prompt Assistant", icon: Sparkles, group: "Create" },
  { id: "video-editor", label: "Video Editor", icon: Scissors, group: "Studio" },
  { id: "templates", label: "Templates", icon: LayoutTemplate, group: "Library" },
  { id: "character-library", label: "Character Library", icon: Users, group: "Library" },
  { id: "asset-library", label: "Asset Library", icon: Image, group: "Library" },
  { id: "projects", label: "My Projects", icon: FolderOpen, group: "Library" },
  { id: "settings", label: "Settings", icon: Settings, group: "Account" },
  { id: "admin", label: "Admin Panel", icon: Shield, group: "Account", admin: true },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { view, setView, user } = useApp();

  const groups = Array.from(new Set(NAV.map((n) => n.group!)));
  const items = NAV.filter((n) => !n.admin || user?.role === "admin");

  return (
    <nav className="flex flex-col gap-5 p-3 h-full overflow-y-auto scrollbar-thin">
      {groups.map((group) => (
        <div key={group} className="space-y-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {group}
          </p>
          {items
            .filter((n) => n.group === group)
            .map((item) => {
              const active = view === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setView(item.id);
                    onNavigate?.();
                  }}
                  className={cn(
                    "group w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "" : "group-hover:text-primary")} />
                  <span className="flex-1 text-left truncate">{item.label}</span>
                  {item.badge && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold">
                      {item.badge}
                    </Badge>
                  )}
                </button>
              );
            })}
        </div>
      ))}
    </nav>
  );
}
