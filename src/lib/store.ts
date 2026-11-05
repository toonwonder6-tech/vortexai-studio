"use client";
import { create } from "zustand";

export type ViewId =
  | "dashboard"
  | "video-generator"
  | "image-generator"
  | "ai-director"
  | "music-video"
  | "script-generator"
  | "storyboard"
  | "video-editor"
  | "voice-studio"
  | "templates"
  | "character-library"
  | "asset-library"
  | "projects"
  | "settings"
  | "admin"
  | "prompt-assistant";

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  status: string;
  avatarUrl: string | null;
  createdAt: string;
}

interface AppState {
  user: User | null;
  loadingUser: boolean;
  view: ViewId;
  viewParam: string | null;
  setUser: (u: User | null) => void;
  setLoadingUser: (b: boolean) => void;
  setView: (v: ViewId, param?: string | null) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  user: null,
  loadingUser: true,
  view: "dashboard",
  viewParam: null,
  setUser: (u) => set({ user: u }),
  setLoadingUser: (b) => set({ loadingUser: b }),
  setView: (v, param = null) => {
    set({ view: v, viewParam: param });
    if (typeof window !== "undefined") {
      const hash = param ? `${v}/${param}` : v;
      window.history.replaceState(null, "", `#${hash}`);
      window.scrollTo({ top: 0 });
    }
  },
  refreshUser: async () => {
    try {
      const res = await fetch("/api/auth", { cache: "no-store" });
      const json = await res.json();
      set({ user: json?.data?.user || null, loadingUser: false });
    } catch {
      set({ loadingUser: false });
    }
  },
  logout: async () => {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch {}
    set({ user: null, view: "dashboard" });
  },
}));

/** Initialise view from URL hash on first client load. */
export function initRouteFromHash() {
  if (typeof window === "undefined") return;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return;
  const [v, ...rest] = hash.split("/");
  const valid: ViewId[] = [
    "dashboard","video-generator","image-generator","ai-director","music-video","script-generator",
    "storyboard","video-editor","voice-studio","templates","character-library",
    "asset-library","projects","settings","admin","prompt-assistant",
  ];
  if (valid.includes(v as ViewId)) {
    useApp.setState({ view: v as ViewId, viewParam: rest.join("/") || null });
  }
}
