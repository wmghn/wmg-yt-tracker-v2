"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Youtube, CheckCircle2, XCircle, ExternalLink, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  channelId: string;
  isConnected: boolean;
  connectedAt?: string | null;      // ISO string của updatedAt
  expiresAt?: string | null;
  scope?: string | null;
  ytChannelId?: string | null;      // YouTube channel ID được authorize (UC...)
  ytChannelName?: string | null;    // Tên kênh YouTube được authorize
  errorParam?: string | null;       // từ URL ?error=...
  successParam?: boolean;           // từ URL ?success=1
}

const ERROR_MESSAGES: Record<string, string> = {
  no_refresh_token:
    "Không nhận được refresh token. Vào myaccount.google.com/permissions, xóa quyền của app rồi thử lại.",
  token_exchange: "Lỗi khi đổi authorization code. Hãy thử lại.",
  server_config: "Server chưa cấu hình YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET.",
  access_denied: "Bạn đã từ chối cấp quyền.",
  channel_not_found: "Không tìm thấy kênh.",
  missing_params: "Thiếu tham số từ Google. Hãy thử lại.",
  internal: "Lỗi máy chủ. Hãy thử lại.",
};

export function YoutubeOAuthCard({
  channelId,
  isConnected,
  connectedAt,
  expiresAt,
  scope,
  ytChannelId,
  ytChannelName,
  errorParam,
  successParam,
}: Props) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    if (!confirm("Ngắt kết nối YouTube? Tính năng sync Analytics sẽ không hoạt động.")) return;
    setDisconnecting(true);
    try {
      await fetch(`/api/channels/${channelId}/oauth`, { method: "DELETE" });
      router.refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  const errorMsg = errorParam ? (ERROR_MESSAGES[errorParam] ?? `Lỗi: ${errorParam}`) : null;
  const hasRevenue = scope?.includes("monetary");

  return (
    <div className="space-y-4">
      {/* Success banner */}
      {successParam && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Kết nối thành công! Giờ bạn có thể nhấn "Cập nhật từ YouTube" trên trang Analytics.
        </div>
      )}

      {/* Error banner */}
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Status card */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-full p-2 ${isConnected ? "bg-red-50" : "bg-zinc-100"}`}>
              <Youtube className={`h-6 w-6 ${isConnected ? "text-red-600" : "text-zinc-400"}`} />
            </div>
            <div>
              <p className="font-semibold text-zinc-900">YouTube Analytics</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                {isConnected ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs text-emerald-700 font-medium">Đã kết nối</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5 text-zinc-400" />
                    <span className="text-xs text-zinc-500">Chưa kết nối</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {disconnecting ? "Đang ngắt..." : "Ngắt kết nối"}
            </Button>
          ) : (
            <Button asChild size="sm" className="bg-red-600 hover:bg-red-700 text-white">
              <a href={`/api/channels/${channelId}/oauth`}>
                <Youtube className="h-3.5 w-3.5 mr-1.5" />
                Kết nối YouTube
              </a>
            </Button>
          )}
        </div>

        {/* Details khi đã kết nối */}
        {isConnected && (
          <div className="mt-4 space-y-2 border-t pt-4">
            {/* Kênh YouTube được authorize */}
            {(ytChannelName || ytChannelId) && (
              <div className="flex justify-between text-xs items-start gap-2">
                <span className="text-zinc-500 shrink-0">Kênh được kết nối</span>
                <div className="text-right">
                  {ytChannelName && (
                    <p className="font-semibold text-zinc-800">{ytChannelName}</p>
                  )}
                  {ytChannelId && (
                    <p className="font-mono text-zinc-400">{ytChannelId}</p>
                  )}
                </div>
              </div>
            )}
            {connectedAt && (
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Cập nhật lần cuối</span>
                <span className="text-zinc-700">
                  {new Date(connectedAt).toLocaleString("vi-VN")}
                </span>
              </div>
            )}
            {expiresAt && (
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Access token hết hạn</span>
                <span className="text-zinc-700">
                  {new Date(expiresAt).toLocaleString("vi-VN")}
                  <span className="ml-1 text-zinc-400">(tự làm mới)</span>
                </span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Quyền Analytics</span>
              <span className="text-emerald-600 font-medium">✓ Đã cấp</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Quyền Revenue (CPM/RPM)</span>
              {hasRevenue ? (
                <span className="text-emerald-600 font-medium">✓ Đã cấp</span>
              ) : (
                <span className="text-zinc-400">Chưa cấp</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hướng dẫn */}
      {!isConnected && (
        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-5 text-sm space-y-3">
          <p className="font-medium text-zinc-700">Cách kết nối:</p>
          <ol className="list-decimal list-inside space-y-1.5 text-zinc-600">
            <li>Nhấn nút <strong>Kết nối YouTube</strong> ở trên.</li>
            <li>
              Đăng nhập bằng tài khoản Google <strong>sở hữu kênh</strong> này.
            </li>
            <li>
              Cấp quyền <em>YouTube Analytics</em> và <em>YouTube Revenue</em>.
            </li>
            <li>Sau khi cấp quyền bạn sẽ được chuyển về trang này.</li>
          </ol>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <ExternalLink className="h-3 w-3" />
            <span>
              Redirect URI cần đăng ký trong Google Console:{" "}
              <code className="rounded bg-white px-1 py-0.5 border">
                {typeof window !== "undefined" ? window.location.origin : ""}/api/oauth/youtube/callback
              </code>
            </span>
          </div>
        </div>
      )}

      {/* Tái kết nối khi đã có */}
      {isConnected && (
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3">
          <p className="text-xs text-zinc-500">
            Muốn cấp lại quyền hoặc chuyển tài khoản?{" "}
            <a
              href={`/api/channels/${channelId}/oauth`}
              className="text-blue-600 hover:underline font-medium"
            >
              Kết nối lại
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
