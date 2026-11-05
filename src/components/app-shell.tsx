"use client";
import { useEffect, useState } from "react";
import { useApp, initRouteFromHash } from "@/lib/store";
import { useMounted } from "@/hooks/use-mounted";
import { Sidebar } from "@/components/sidebar";
import { AuthScreen } from "@/components/auth-screen";
import { ThemeProvider } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Clapperboard, LogOut, Menu, Moon, Sun, User as UserIcon, Shield } from "lucide-react";
import { useTheme } from "next-themes";
import { motion, AnimatePresence } from "framer-motion";
import { DashboardView } from "@/components/views/dashboard-view";
import { VideoGeneratorView } from "@/components/views/video-generator-view";
import { ImageGeneratorView } from "@/components/views/image-generator-view";
import { AiDirectorView } from "@/components/views/ai-director-view";
import { MusicVideoView } from "@/components/views/music-video-view";
import { ScriptGeneratorView } from "@/components/views/script-generator-view";
import { StoryboardView } from "@/components/views/storyboard-view";
import { VoiceStudioView } from "@/components/views/voice-studio-view";
import { VideoEditorView } from "@/components/views/video-editor-view";
import { TemplatesView } from "@/components/views/templates-view";
import { CharacterLibraryView } from "@/components/views/character-library-view";
import { AssetLibraryView } from "@/components/views/asset-library-view";
import { ProjectsView } from "@/components/views/projects-view";
import { SettingsView } from "@/components/views/settings-view";
import { AdminView } from "@/components/views/admin-view";
import { PromptAssistantView } from "@/components/views/prompt-assistant-view";

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  if (!mounted) return <div className="h-9 w-9" />;
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

function TopBar() {
  const { user, logout, setView } = useApp();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 h-14 border-b glass flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        {/* Mobile sidebar trigger */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <div className="flex items-center gap-2 h-14 px-4 border-b">
              <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary text-primary-foreground">
                <Clapperboard className="h-4 w-4" />
              </div>
              <span className="font-bold">VortexAI</span>
            </div>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="lg:hidden flex items-center gap-2">
          <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary text-primary-foreground">
            <Clapperboard className="h-4 w-4" />
          </div>
          <span className="font-bold">VortexAI</span>
        </div>
        <div className="hidden lg:block">
          <span className="text-sm text-muted-foreground">
            Free AI Video Production Studio
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 h-9 pl-1.5 pr-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="bg-primary/15 text-primary text-xs">
                  {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium hidden sm:block max-w-[120px] truncate">
                {user?.name || user?.email}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="truncate">{user?.email}</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {user?.role} account
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setView("settings")}>
              <UserIcon className="h-4 w-4 mr-2" /> Settings
            </DropdownMenuItem>
            {user?.role === "admin" && (
              <DropdownMenuItem onClick={() => setView("admin")}>
                <Shield className="h-4 w-4 mr-2" /> Admin Panel
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => logout()} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t bg-card/50">
      <div className="px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-3.5 w-3.5 text-primary" />
          <span>VortexAI Studio · Free forever, powered by Z.ai</span>
        </div>
        <div className="flex items-center gap-4">
          <span>No subscriptions · No credits · No limits on creativity</span>
        </div>
      </div>
    </footer>
  );
}

function ViewRouter() {
  const { view } = useApp();
  const map: Record<string, React.ReactNode> = {
    dashboard: <DashboardView />,
    "video-generator": <VideoGeneratorView />,
    "image-generator": <ImageGeneratorView />,
    "ai-director": <AiDirectorView />,
    "music-video": <MusicVideoView />,
    "script-generator": <ScriptGeneratorView />,
    storyboard: <StoryboardView />,
    "voice-studio": <VoiceStudioView />,
    "video-editor": <VideoEditorView />,
    templates: <TemplatesView />,
    "character-library": <CharacterLibraryView />,
    "asset-library": <AssetLibraryView />,
    projects: <ProjectsView />,
    settings: <SettingsView />,
    admin: <AdminView />,
    "prompt-assistant": <PromptAssistantView />,
  };
  return (
    <AnimatePresence mode="wait">
      <motion.main
        key={view}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18 }}
        className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1500px] mx-auto w-full"
      >
        {map[view] || <DashboardView />}
      </motion.main>
    </AnimatePresence>
  );
}

export function AppShell() {
  const { user, loadingUser, refreshUser } = useApp();

  useEffect(() => {
    initRouteFromHash();
    refreshUser();
    const onHashChange = () => initRouteFromHash();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [refreshUser]);

  if (loadingUser) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <div className="grid place-items-center h-12 w-12 rounded-2xl bg-primary text-primary-foreground animate-pulse">
            <Clapperboard className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">Loading studio…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <ThemeProvider>
        <AuthScreen />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col">
        <div className="flex flex-1">
          {/* Desktop sidebar */}
          <aside className="hidden lg:flex w-64 shrink-0 border-r bg-sidebar flex-col">
            <div className="h-14 flex items-center gap-2 px-4 border-b">
              <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary text-primary-foreground">
                <Clapperboard className="h-4 w-4" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-bold text-sm">VortexAI</span>
                <span className="text-[10px] text-muted-foreground">Studio</span>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              <Sidebar />
            </div>
          </aside>

          <div className="flex-1 flex flex-col min-w-0">
            <TopBar />
            <ViewRouter />
            <Footer />
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}
