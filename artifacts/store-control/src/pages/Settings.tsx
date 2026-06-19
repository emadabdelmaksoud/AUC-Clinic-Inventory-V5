import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Settings, Moon, Sun } from "lucide-react";
import { toast } from "sonner";

async function getSetting(key: string): Promise<string | null> {
  const row = await db.settings.get(key);
  return row?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db.settings.put({ key, value });
}

export default function SettingsPage() {
  const qc = useQueryClient();
  const [darkMode, setDarkMode] = useState(document.documentElement.classList.contains("dark"));
  const [orgName, setOrgName] = useState("");
  const [nearExpiryDays, setNearExpiryDays] = useState("90");
  const [saving, setSaving] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const [org, days] = await Promise.all([getSetting("orgName"), getSetting("nearExpiryDays")]);
      return { orgName: org ?? "", nearExpiryDays: days ?? "90" };
    },
  });

  useEffect(() => {
    if (settings) {
      setOrgName(settings.orgName);
      setNearExpiryDays(settings.nearExpiryDays);
    }
  }, [settings]);

  function toggleDarkMode(enabled: boolean) {
    setDarkMode(enabled);
    if (enabled) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", enabled ? "dark" : "light");
  }

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") { setDarkMode(true); document.documentElement.classList.add("dark"); }
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([setSetting("orgName", orgName), setSetting("nearExpiryDays", nearExpiryDays)]);
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) { toast.error((e as Error).message); }
    setSaving(false);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="w-6 h-6" /> Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your Clinic Inventory app</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">General</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Organization / Clinic Name</Label>
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Main Clinic" data-testid="input-org-name" />
          </div>
          <div className="space-y-1.5">
            <Label>Near-Expiry Warning Days</Label>
            <Input type="number" min="1" max="365" value={nearExpiryDays} onChange={(e) => setNearExpiryDays(e.target.value)} data-testid="input-near-expiry-days" />
            <p className="text-xs text-muted-foreground">Products expiring within this many days are flagged as "Near Expiry".</p>
          </div>
          <Button onClick={handleSave} disabled={saving} data-testid="button-save-settings">{saving ? "Saving..." : "Save Settings"}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Appearance</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {darkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              <div>
                <p className="text-sm font-medium">Dark Mode</p>
                <p className="text-xs text-muted-foreground">Toggle dark/light theme</p>
              </div>
            </div>
            <Switch checked={darkMode} onCheckedChange={toggleDarkMode} data-testid="switch-dark-mode" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">About</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex justify-between"><span>App</span><span className="font-medium text-foreground">Clinic Inventory</span></div>
          <div className="flex justify-between"><span>Version</span><span>1.0.0</span></div>
          <div className="flex justify-between"><span>Storage</span><span>Browser IndexedDB</span></div>
          <div className="flex justify-between"><span>Mode</span><span>Fully Offline</span></div>
        </CardContent>
      </Card>
    </div>
  );
}
