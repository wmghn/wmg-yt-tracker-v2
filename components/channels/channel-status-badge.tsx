import { Badge } from "@/components/ui/badge";
import type { ChannelStatus } from "@/types";

type Props = {
  status: ChannelStatus | string;
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING_BKT: {
    label: "Chờ BKT",
    className: "bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100",
  },
  ACTIVE: {
    label: "Hoạt động",
    className: "bg-green-100 text-green-800 border-green-200 hover:bg-green-100",
  },
  INACTIVE: {
    label: "Ngừng",
    className: "bg-zinc-100 text-zinc-600 border-zinc-200 hover:bg-zinc-100",
  },
};

export function ChannelStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className: "bg-zinc-100 text-zinc-600",
  };

  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
