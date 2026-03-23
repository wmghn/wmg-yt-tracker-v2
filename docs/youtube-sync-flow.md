# Luồng dữ liệu: Nút "Cập nhật từ YouTube"

## Tổng quan

Khi bấm nút **"Cập nhật từ YouTube"**, hệ thống sẽ:
1. Tạo một job ngay lập tức và trả về `202 Accepted`
2. Chạy sync ngầm (background)
3. Frontend poll mỗi 3 giây để theo dõi tiến trình
4. Khi xong, tự động reload dữ liệu analytics

---

## Sơ đồ luồng

```
[User bấm nút]
      │
      ▼
sync-button.tsx
  handleSync()
      │
      ▼ POST /api/analytics/sync
      │   { channelId?, dateRange, month?, year? }
      │
      ▼
app/api/analytics/sync/route.ts
  ├─ requireRole(DIRECTOR | MANAGER)
  ├─ Validate channel quyền (MANAGER chỉ sync kênh của mình)
  ├─ INSERT sync_jobs { status: "pending" }
  ├─ Return { jobId } HTTP 202 ngay lập tức
  │
  └─ [Fire background — không await]
         │
         ├─ Production (Netlify):
         │    POST /.netlify/functions/sync-background
         │
         └─ Dev (local):
              void async () => syncAnalyticsSnapshots(...)

[Frontend nhận jobId → bắt đầu poll]
      │
      ▼ GET /api/analytics/sync/status?jobId=xxx  (mỗi 3 giây)
      │
      ▼ Cập nhật UI: pending → running → done/error
```

---

## Chi tiết từng bước

### Bước 1 — Gọi API sync

**File:** `components/analytics/sync-button.tsx`

```
POST /api/analytics/sync
Body: {
  channelId:  string | undefined   // cụ thể 1 kênh, hoặc undefined = tất cả
  dateRange:  "7days" | "28days" | "90days" | "365days" | "lifetime" | "month" | "year"
  month?:     number               // 1-12, dùng khi dateRange = "month"
  year?:      number               // dùng khi dateRange = "month" | "year"
}
```

**Response ngay lập tức:**
```json
{ "jobId": "uuid" }   // HTTP 202
```

---

### Bước 2 — API tạo job và fire background

**File:** `app/api/analytics/sync/route.ts`

- Kiểm tra quyền: DIRECTOR sync tất cả kênh active; MANAGER chỉ sync kênh mình quản lý
- Tạo record trong bảng `sync_jobs` (`status: "pending"`)
- Fire background function (không đợi) và trả `202` ngay

---

### Bước 3 — Background sync chạy

**File:**
- Production: `netlify/functions/sync-background.mts`
- Local dev: chạy inline trong route handler

Gọi hàm `syncAnalyticsSnapshots(channelIds, rangeType, month, year)` từ `lib/analytics/sync.ts`

---

### Bước 4 — syncAnalyticsSnapshots() — logic chính

**File:** `lib/analytics/sync.ts`

#### 4.1 Resolve date range
Chuyển `"28days"` / `"month"` / v.v. thành `startDate` và `endDate` cụ thể (YYYY-MM-DD).

```
"7days"    → 7 ngày qua tính từ hôm nay
"28days"   → 28 ngày qua
"month"    → đầu tháng → cuối tháng (VD: 2026-03-01 → 2026-03-31)
"year"     → 01/01/năm → 31/12/năm
"lifetime" → 2005-01-01 → hôm nay
```

#### 4.2 Lấy danh sách kênh + OAuth token
```sql
SELECT id, name, youtubeChannelId
FROM channels
WHERE status = 'ACTIVE'
  AND oauthTokenId IS NOT NULL
  AND id = ANY(channelIds)
```

#### 4.3 Refresh token nếu hết hạn
**File:** `lib/youtube/token.ts` — `getValidAccessToken(channelId)`

- Nếu token còn hạn (> 60 giây): dùng luôn
- Nếu hết hạn: gọi Google OAuth2 để refresh, cập nhật bảng `youtube_oauth_tokens`

#### 4.4 Gọi YouTube Analytics API
**File:** `lib/youtube/analytics-api.ts`

```
GET https://youtubeanalytics.googleapis.com/v2/reports
  ids=channel==MINE
  dimensions=video
  metrics=views,estimatedMinutesWatched
  startDate=YYYY-MM-DD
  endDate=YYYY-MM-DD
  sort=-views
  maxResults=200
```

Tự động fetch nhiều trang nếu kênh có > 200 video.

**Kết quả:** Danh sách `[{ ytVideoId, views, estimatedMinutesWatched }]`

#### 4.5 Gọi YouTube Data API để lấy metadata
**File:** `lib/youtube/data-api.ts`

```
GET https://www.googleapis.com/youtube/v3/videos
  part=snippet,statistics
  id=vid1,vid2,vid3,...
  key=YOUTUBE_API_KEY
```

**Kết quả:** `{ title, thumbnailUrl, publishedAt, viewCount, ... }` theo từng video

#### 4.6 Upsert dữ liệu vào database

**Bảng `videos`** — tạo mới hoặc cập nhật title/thumbnail:
```sql
INSERT INTO videos (youtubeVideoId, title, thumbnailUrl, channelId, isActive)
VALUES (...)
ON CONFLICT (youtubeVideoId) DO UPDATE SET title = ..., thumbnailUrl = ...
```

**Bảng `analytics_snapshots`** — đây là bảng chính lưu views:
```sql
INSERT INTO analytics_snapshots
  (id, videoId, startDate, date, views, estimatedMinutesWatched, fetchedAt)
VALUES (...)
ON CONFLICT (videoId, startDate, date) DO UPDATE SET
  views = EXCLUDED.views,
  estimatedMinutesWatched = EXCLUDED.estimatedMinutesWatched,
  fetchedAt = now()
```

> **Unique constraint:** `(videoId, startDate, date)` — mỗi video chỉ có 1 snapshot theo cặp `(startDate, endDate)`.
> Sync lại cùng khoảng thời gian sẽ **overwrite** (cập nhật views mới nhất).
> Sync khoảng thời gian khác sẽ tạo **snapshot riêng biệt**.

---

### Bước 5 — Cập nhật SyncJob

```
sync_jobs.status: "pending" → "running" → "done" | "error"
sync_jobs.result: { channelsSynced, videosSynced, snapshotsUpserted, errors[] }
```

---

### Bước 6 — Frontend poll & refresh

**File:** `components/analytics/sync-button.tsx`

- Poll `GET /api/analytics/sync/status?jobId=xxx` mỗi **3 giây**
- Khi `status === "done"`: gọi callback `onDone()` → parent refetch analytics
- Khi `status === "error"`: hiển thị lỗi
- Tự reset về "idle" sau **10 giây**

**Callback `onDone`** → gọi lại:
```
GET /api/analytics/channel-analytics?dateRange=...&channelId=...
```

→ Query `analytics_snapshots` mới nhất → render lại UI với dữ liệu mới

---

## Các bảng DB được ghi

| Bảng | Khi nào | Nội dung |
|---|---|---|
| `sync_jobs` | Ngay khi bấm nút | Tạo job, cập nhật status và result |
| `youtube_oauth_tokens` | Nếu token hết hạn | `accessToken`, `expiresAt` mới |
| `videos` | Luôn luôn | Tạo mới video chưa biết; cập nhật `title`, `thumbnailUrl` |
| `analytics_snapshots` | Luôn luôn | **Dữ liệu chính:** `views`, `estimatedMinutesWatched` theo từng video + khoảng thời gian |

---

## Trạng thái nút

| Trạng thái | Hiển thị |
|---|---|
| idle | "Cập nhật từ YouTube" |
| pending | "Đang khởi động..." |
| running | "Đang sync... (Xs)" — đếm giây |
| done | "Đã cập nhật" + kết quả: `X video · Y snapshots · Zs` |
| error | "Có lỗi" + chi tiết lỗi |

---

## Ghi chú quan trọng

- **Không blocking:** POST trả về ngay, sync chạy ngầm → UX không bị đơ
- **Idempotent:** Sync lại cùng khoảng thời gian chỉ overwrite, không tạo duplicate
- **Token tự động refresh:** Không cần thao tác thủ công khi token hết hạn
- **MANAGER bị giới hạn:** Chỉ sync được kênh mình quản lý, không sync được kênh khác
