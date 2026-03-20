import { Badge } from "@/components/ui/badge";

type Props = {
  status: "PENDING" | "APPROVED" | "REJECTED";
};

export function AssignmentStatusBadge({ status }: Props) {
  if (status === "PENDING") {
    return (
      <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-yellow-200">
        Chờ duyệt
      </Badge>
    );
  }

  if (status === "APPROVED") {
    return (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">
        Đã duyệt
      </Badge>
    );
  }

  return (
    <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">
      Từ chối
    </Badge>
  );
}
