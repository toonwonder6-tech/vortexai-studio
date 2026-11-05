"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/lib/store";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Film, Wand2, Clapperboard, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AuthScreen() {
  const { refreshUser } = useApp();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await api("/api/auth", {
      method: "POST",
      body: JSON.stringify({ action: mode, email, name, password }),
    });
    setLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(mode === "login" ? "Welcome back!" : "Account created — welcome to VortexAI!");
    await refreshUser();
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 lg:w-1/2 overflow-hidden bg-gradient-to-br from-primary/20 via-background to-background">
        <div className="absolute inset-0 grid-bg opacity-40" />
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-chart-2/20 blur-3xl" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="grid place-items-center h-11 w-11 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Clapperboard className="h-6 w-6" />
          </div>
          <span className="text-2xl font-bold tracking-tight">VortexAI Studio</span>
        </div>

        <div className="relative z-10 space-y-6">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl xl:text-5xl font-bold leading-tight"
          >
            The complete <span className="text-gradient">AI video production</span> studio — free, forever.
          </motion.h1>
          <p className="text-lg text-muted-foreground max-w-md">
            Generate, direct, edit and voice cinematic videos powered exclusively by Z.ai. No subscriptions. No credits. No limits on creativity.
          </p>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            {[
              { icon: Film, label: "Text & Image to Video" },
              { icon: Wand2, label: "One-click AI Director" },
              { icon: Sparkles, label: "AI Image & Voice Studio" },
              { icon: Clapperboard, label: "Pro Video Editor" },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-2 rounded-lg border bg-card/50 p-3 backdrop-blur">
                <f.icon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{f.label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-muted-foreground">
          Powered by Z.ai · 100% free for every creator
        </p>
      </div>

      {/* Right auth form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="grid place-items-center h-10 w-10 rounded-xl bg-primary text-primary-foreground">
              <Clapperboard className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold">VortexAI Studio</span>
          </div>

          <Card className="border-border/60 shadow-xl">
            <CardHeader>
              <CardTitle className="text-2xl">Welcome</CardTitle>
              <CardDescription>
                Sign in to your free studio account, or create one in seconds.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login">Sign in</TabsTrigger>
                  <TabsTrigger value="register">Create account</TabsTrigger>
                </TabsList>

                <AnimatePresence mode="wait">
                  <motion.form
                    key={mode}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    onSubmit={submit}
                    className="space-y-4"
                  >
                    {mode === "register" && (
                      <div className="space-y-2">
                        <Label htmlFor="name">Display name</Label>
                        <Input
                          id="name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Your name"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                      />
                      <p className="text-xs text-muted-foreground">
                        {mode === "register"
                          ? "At least 6 characters. The first account becomes the administrator."
                          : "Use the credentials you registered with."}
                      </p>
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {mode === "login" ? "Sign in" : "Create free account"}
                    </Button>
                  </motion.form>
                </AnimatePresence>
              </Tabs>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Free forever · No credit card · Powered by Z.ai
          </p>
        </motion.div>
      </div>
    </div>
  );
}
