import { Badge } from "@/components/ui/badge";

type Props = {
  role: "WRITER" | "EDITOR";
};

export function RoleBadge({ role }: Props) {
  if (role === "WRITER") {
    return (
      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200">
        Biên kịch
      </Badge>
    );
  }

  return (
    <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 border-purple-200">
      Dựng phim
    </Badge>
  );
}
