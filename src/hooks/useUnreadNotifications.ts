import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export function useUnreadNotifications() {
  const { user, organizationId } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    if (!user?.id || !organizationId) return;

    try {
      // Use a direct count query - more reliable
      const { data, error } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", user.id)
        .eq("organization_id", organizationId)
        .eq("read", false);

      if (error) throw error;
      setUnreadCount(data?.length || 0);
    } catch (error) {
      console.error("Error fetching unread count:", error);
      setUnreadCount(0);
    }
  }, [user?.id, organizationId]);

  useEffect(() => {
    if (!user?.id || !organizationId) return;

    fetchUnreadCount();

    const channel = supabase
      .channel(`unread-notifications-count-${user.id}`)
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'notifications',
          filter: `user_id=eq.${user.id} AND organization_id=eq.${organizationId}`
        }, 
        (payload) => {
          console.log('Unread notification inserted:', payload);
          const newNotif = payload.new as any;
          // Only increment if notification is unread
          if (!newNotif.read) {
            setUnreadCount(prev => prev + 1);
          }
        }
      )
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id} AND organization_id=eq.${organizationId}`
        },
        (payload) => {
          const oldNotif = payload.old as any;
          const newNotif = payload.new as any;
          
          // If read status changed, update count accordingly
          if (oldNotif.read !== newNotif.read) {
            if (newNotif.read) {
              // Marked as read - decrement
              setUnreadCount(prev => Math.max(0, prev - 1));
            } else {
              // Marked as unread - increment
              setUnreadCount(prev => prev + 1);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Unread count subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, organizationId, fetchUnreadCount]);

  return { unreadCount, refreshCount: fetchUnreadCount };
}

