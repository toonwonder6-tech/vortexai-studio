"use client";
import { useState } from "react";
import { PageHeader, SectionCard } from "@/components/shared";
import { api } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Settings, Loader2, Save, KeyRound, ShieldCheck, UserCircle, CalendarDays,
  Lock, Info, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

export function SettingsView() {
  const { user, refreshUser } = useApp();

  const [name, setName] = useState(user?.name || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const isAdmin = user?.role === "admin";
  const initials = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
  const created = user?.createdAt ? new Date(user.createdAt) : null;

  async function saveProfile() {
    if (!name.trim()) {
      toast.error("Name cannot be empty.");
      return;
    }
    setSavingProfile(true);
    const r = await api("/api/auth", {
      method: "POST",
      body: JSON.stringify({
        action: "update-profile",
        name: name.trim(),
        avatarUrl: avatarUrl.trim() || null,
      }),
    });
    setSavingProfile(false);
    if (!r.ok) {
      toast.error(r.error || "Could not save profile.");
      return;
    }
    toast.success("Profile updated.");
    await refreshUser();
  }

  async function changePassword() {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error("Please fill in all password fields.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirmation do not match.");
      return;
    }
    setSavingPassword(true);
    const r = await api("/api/auth", {
      method: "POST",
      body: JSON.stringify({
        action: "change-password",
        currentPassword,
        newPassword,
      }),
    });
    setSavingPassword(false);
    if (!r.ok) {
      toast.error(r.error || "Could not change password.");
      return;
    }
    toast.success("Password changed.");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your profile, security and account details. VortexAI Studio is free for everyone — all features are available with equal access."
        icon={<Settings className="h-5 w-5" />}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Profile */}
        <SectionCard title="Profile" description="Update your display name and avatar.">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
                <AvatarFallback className="text-xl font-semibold bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <Label>Avatar URL</Label>
                <Input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://…/avatar.png"
                  className="text-xs h-9"
                />
                <p className="text-[10px] text-muted-foreground">
                  Paste an image URL to set your avatar.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Display name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email || ""} disabled className="bg-muted/50" />
              <p className="text-[10px] text-muted-foreground">
                Email cannot be changed on this platform.
              </p>
            </div>

            <Button onClick={saveProfile} disabled={savingProfile} className="gap-2 w-full sm:w-auto">
              {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Profile
            </Button>
          </div>
        </SectionCard>

        {/* Change password */}
        <SectionCard title="Change password" description="Choose a strong password of at least 6 characters.">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Current password</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label>New password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm new password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-[10px] text-red-500">Passwords do not match.</p>
              )}
            </div>
            <Button
              onClick={changePassword}
              disabled={savingPassword}
              variant="outline"
              className="gap-2 w-full sm:w-auto"
            >
              {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Change Password
            </Button>
          </div>
        </SectionCard>

        {/* Account info */}
        <SectionCard title="Account" description="Your account details and plan.">
          <div className="space-y-3">
            <Row
              icon={<UserCircle className="h-4 w-4" />}
              label="Role"
              value={<Badge variant={isAdmin ? "default" : "secondary"} className="capitalize">{user?.role || "user"}</Badge>}
            />
            <Row
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Status"
              value={<Badge variant="outline" className="capitalize">{user?.status || "active"}</Badge>}
            />
            <Row
              icon={<CalendarDays className="h-4 w-4" />}
              label="Member since"
              value={<span className="text-sm">{created ? created.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—"}</span>}
            />
            <div className="rounded-lg border bg-primary/5 p-3 flex items-start gap-2.5">
              <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                This is a <span className="font-medium text-foreground">free account</span> on VortexAI Studio.
                All creative tools — video, image, voice, director — are available to you with equal access,
                subject to fair daily usage limits.
              </p>
            </div>
          </div>
        </SectionCard>

        {/* Danger zone */}
        <SectionCard title="Danger zone" description="Account removal and sensitive actions.">
          <div className="space-y-3">
            <div className="rounded-lg border border-dashed p-3 flex items-start gap-2.5">
              <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Self-service account deletion is disabled</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  For your safety, accounts cannot be deleted from this page.
                  {isAdmin ? " As an admin, manage users from the Admin panel." : " If you need your account removed, contact the platform administrator."}
                </p>
              </div>
            </div>
            {!isAdmin && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  You are signed in as a standard user. Administrative tools — such as user management,
                  system-wide settings and content moderation — are only available to admins.
                </p>
              </div>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function Row({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </div>
      <div>{value}</div>
    </div>
  );
}
