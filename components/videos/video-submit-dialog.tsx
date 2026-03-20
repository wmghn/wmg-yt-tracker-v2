"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VideoThumbnail } from "@/components/videos/video-thumbnail";

type Channel = {
  id: string;
  name: string;
};

type VideoPreview = {
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string;
  viewCount: number;
};

type Props = {
  channels: Channel[];
};

function extractVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Pure ID: 11 chars alphanumeric + _ + -
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  // youtube.com/watch?v=...
  const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // youtu.be/...
  const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/shorts/...
  const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];

  return null;
}

export function VideoSubmitDialog({ channels }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rawInput, setRawInput] = useState("");
  const [channelId, setChannelId] = useState("");
  const [previews, setPreviews] = useState<VideoPreview[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function getVideoIds(): string[] {
    return rawInput
      .split("\n")
      .map((line) => extractVideoId(line))
      .filter((id): id is string => id !== null);
  }

  async function handlePreview() {
    const ids = getVideoIds();
    if (ids.length === 0) {
      toast.error("Không tìm thấy Video ID hợp lệ");
      return;
    }

    setPreviewing(true);
    try {
      const params = new URLSearchParams({ ids: ids.join(",") });
      const res = await fetch(`/api/videos/preview?${params}`);
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Không thể xem trước");
        return;
      }
      const data = await res.json();
      setPreviews(data.videos ?? []);
    } catch {
      toast.error("Lỗi kết nối khi xem trước");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleSubmit() {
    const videoIds = getVideoIds();
    if (videoIds.length === 0) {
      toast.error("Không tìm thấy Video ID hợp lệ");
      return;
    }
    if (!channelId) {
      toast.error("Vui lòng chọn kênh");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoIds, channelId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Khai báo video thất bại");
        return;
      }

      toast.success(
        `Thành công: ${data.created} video mới, ${data.skipped} đã tồn tại`
      );
      setOpen(false);
      setRawInput("");
      setChannelId("");
      setPreviews([]);
      router.refresh();
    } catch {
      toast.error("Lỗi kết nối, vui lòng thử lại");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) {
      setRawInput("");
      setChannelId("");
      setPreviews([]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Khai báo Video
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Khai báo Video YouTube</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Channel selector */}
          <div className="space-y-2">
            <Label>Kênh</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn kênh..." />
              </SelectTrigger>
              <SelectContent>
                {channels.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Video IDs input */}
          <div className="space-y-2">
            <Label>
              YouTube Video IDs hoặc URLs{" "}
              <span className="text-zinc-400 font-normal">(mỗi dòng 1 video)</span>
            </Label>
            <textarea
              className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y font-mono"
              placeholder={`dQw4w9WgXcQ\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\nhttps://youtu.be/dQw4w9WgXcQ`}
              value={rawInput}
              onChange={(e) => {
                setRawInput(e.target.value);
                setPreviews([]);
              }}
            />
            <p className="text-xs text-zinc-400">
              Nhận diện được: {getVideoIds().length} video ID hợp lệ
            </p>
          </div>

          {/* Preview button */}
          <Button
            type="button"
            variant="outline"
            onClick={handlePreview}
            disabled={previewing || getVideoIds().length === 0}
          >
            {previewing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Eye className="h-4 w-4 mr-2" />
            )}
            Xem trước
          </Button>

          {/* Preview list */}
          {previews.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-700">
                Kết quả xem trước ({previews.length} video):
              </p>
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {previews.map((v) => (
                  <div
                    key={v.youtubeVideoId}
                    className="flex items-center gap-3 p-2 rounded-lg border bg-zinc-50"
                  >
                    <VideoThumbnail src={v.thumbnailUrl} alt={v.title} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-900 truncate">
                        {v.title}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {v.viewCount.toLocaleString("vi-VN")} lượt xem ·{" "}
                        <span className="font-mono">{v.youtubeVideoId}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || getVideoIds().length === 0 || !channelId}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Xác nhận khai báo
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
