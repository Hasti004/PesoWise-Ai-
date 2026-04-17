import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ExpenseStatus = "submitted" | "verified" | "approved" | "rejected";

interface StatusBadgeProps {
  status: ExpenseStatus | string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success"; bgColor?: string }> = {
    submitted: { label: "Submitted", variant: "default" as const },
    verified: { label: "Verified", variant: "default" as const, bgColor: "bg-green-100 text-green-800 border-green-200" },
    approved: { label: "Approved", variant: "default" as const, bgColor: "bg-green-100 text-green-800 border-green-200" },
    rejected: { label: "Rejected", variant: "destructive" as const, bgColor: "bg-red-100 text-red-800 border-red-200" },
  };

  const config = statusConfig[status] || { label: String(status), variant: "secondary" as const };

  return (
    <Badge variant={config.variant} className={cn(config.bgColor, className)}>
      {config.label}
    </Badge>
  );
}
