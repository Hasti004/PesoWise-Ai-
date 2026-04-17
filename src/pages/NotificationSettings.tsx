import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Bell, Volume2, VolumeX } from "lucide-react";

interface NotificationSettings {
  popup_enabled: boolean;
  sound_enabled: boolean;
  desktop_enabled: boolean;
}

export default function NotificationSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<NotificationSettings>({
    popup_enabled: true,
    sound_enabled: true,
    desktop_enabled: false,
  });

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("notification_settings")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (!error && data?.notification_settings) {
        setSettings({
          popup_enabled: data.notification_settings.popup_enabled ?? true,
          sound_enabled: data.notification_settings.sound_enabled ?? true,
          desktop_enabled: data.notification_settings.desktop_enabled ?? false,
        });
      } else {
        const stored = localStorage.getItem(`notification_settings_${user?.id}`);
        if (stored) {
          try {
            setSettings(JSON.parse(stored));
          } catch {
            // use defaults
          }
        }
      }
    } catch {
      // 400 etc. if notification_settings column missing – use localStorage or defaults
      const stored = localStorage.getItem(`notification_settings_${user?.id}`);
      if (stored) {
        try {
          setSettings(JSON.parse(stored));
        } catch {
          // use defaults
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (newSettings: NotificationSettings) => {
    try {
      setSettings(newSettings);
      
      // Save to localStorage immediately
      localStorage.setItem(`notification_settings_${user?.id}`, JSON.stringify(newSettings));

      // Try to save to database
      const { error } = await supabase
        .from("profiles")
        .update({
          notification_settings: newSettings,
        })
        .eq("user_id", user?.id);

      if (error) {
        console.error("Error saving to database, using localStorage only:", error);
      }

      toast({
        title: "Settings saved",
        description: "Your notification preferences have been updated",
      });
    } catch (error) {
      console.error("Error saving notification settings:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to save settings",
      });
    }
  };

  const updateSetting = (key: keyof NotificationSettings, value: boolean) => {
    const newSettings = { ...settings, [key]: value };
    saveSettings(newSettings);
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notification Settings</h1>
          <p className="text-muted-foreground">Manage your notification preferences</p>
        </div>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notification Settings</h1>
        <p className="text-muted-foreground">
          Manage how you receive notifications
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Control how notifications appear and behave
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="popup" className="text-base">
                Popup Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Show WhatsApp-style popup notifications when new notifications arrive
              </p>
            </div>
            <Switch
              id="popup"
              checked={settings.popup_enabled}
              onCheckedChange={(checked) => updateSetting("popup_enabled", checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="sound" className="text-base flex items-center gap-2">
                {settings.sound_enabled ? (
                  <Volume2 className="h-4 w-4" />
                ) : (
                  <VolumeX className="h-4 w-4" />
                )}
                Sound Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Play a sound when new notifications arrive
              </p>
            </div>
            <Switch
              id="sound"
              checked={settings.sound_enabled}
              onCheckedChange={(checked) => updateSetting("sound_enabled", checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="desktop" className="text-base">
                Desktop Notifications
              </Label>
              <p className="text-sm text-muted-foreground">
                Show browser desktop notifications (requires permission)
              </p>
            </div>
            <Switch
              id="desktop"
              checked={settings.desktop_enabled}
              onCheckedChange={async (checked) => {
                if (checked && "Notification" in window) {
                  const permission = await Notification.requestPermission();
                  if (permission === "granted") {
                    updateSetting("desktop_enabled", true);
                  } else {
                    toast({
                      variant: "destructive",
                      title: "Permission denied",
                      description: "Please enable desktop notifications in your browser settings",
                    });
                  }
                } else {
                  updateSetting("desktop_enabled", checked);
                }
              }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

