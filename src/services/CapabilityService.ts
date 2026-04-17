import { supabase } from "@/integrations/supabase/client";

export interface SystemCapabilities {
  masterAdminSupported: boolean;
  moneyReturnSupported: boolean;
}

class CapabilityService {
  private capabilities: SystemCapabilities | null = null;
  private probePromise: Promise<SystemCapabilities> | null = null;

  async getCapabilities(): Promise<SystemCapabilities> {
    if (this.capabilities) return this.capabilities;
    if (this.probePromise) return this.probePromise;

    this.probePromise = this.probeSystem();
    return this.probePromise;
  }

  private async probeSystem(): Promise<SystemCapabilities> {
    console.log("🔍 Probing system capabilities...");
    // Avoid probing non-universal columns via REST because it creates noisy 400 logs
    // in environments where master-admin migrations are not applied yet.
    // Keep this feature disabled unless explicitly enabled in a future safe probe path.
    const masterAdminSupported = false;
    
    // Check for Money Return support (money_return_requests table)
    const moneyReturnSupported = await this.checkTableExists("money_return_requests");

    this.capabilities = {
      masterAdminSupported,
      moneyReturnSupported,
    };

    console.log("✅ System capabilities detected:", this.capabilities);
    return this.capabilities;
  }

  private async checkColumnExists(table: string, column: string): Promise<boolean> {
    try {
      const { error } = await (supabase as any)
        .from(table)
        .select(column)
        .limit(0);
      
      // If error.code is '42703' (undefined_column), the feature is missing locally
      if (error && (error.code === '42703' || error.code === 'PGRST204')) {
        return false;
      }
      return !error;
    } catch (e) {
      return false;
    }
  }

  private async checkTableExists(table: string): Promise<boolean> {
    try {
      const { error } = await (supabase as any)
        .from(table)
        .select("id")
        .limit(0);
      
      // If error.code is '42P01' (undefined_table), the feature is missing locally
      if (error && error.code === '42P01') {
        return false;
      }
      return !error;
    } catch (e) {
      return false;
    }
  }
}

export const capabilityService = new CapabilityService();
