# 📋 YT Payroll Platform — Master Specification
> Tài liệu này dùng để giao cho Claude Agent code từng phase.
> Mỗi section "AGENT PROMPT" là lệnh bạn paste trực tiếp vào Claude Code.

---

## 🏗️ TỔNG QUAN HỆ THỐNG

**Tên dự án:** YT Payroll Platform
**Mục tiêu:** Quản lý kênh YouTube, phân công nhân sự, tính lương theo views + doanh thu
**Tech Stack:**
- Frontend + API: Next.js 14 (App Router) + TypeScript
- Database: PostgreSQL (Supabase)
- ORM: Prisma
- Auth: NextAuth.js v5
- UI: Tailwind CSS + shadcn/ui
- Background Jobs: Vercel Cron
- External API: YouTube Data API v3 + YouTube Analytics API

---

## 🗄️ PHASE 0 — DATABASE SCHEMA

### Mô tả các bảng

```
users                   → Tài khoản hệ thống (Director / Manager / Staff)
channels                → Kênh YouTube (trạng thái: pending_bkt / active / inactive)
channel_members         → Quan hệ nhiều-nhiều: User ↔ Channel
videos                  → Video YouTube trong kênh
video_role_assignments  → Ai làm gì trong video (Writer / Editor), Director duyệt
video_views_log         → Lịch sử views (append-only, không overwrite)
channel_weight_configs  → Tỉ trọng % theo vai trò trong từng kênh (Manager thiết lập)
salary_configs          → Lương cứng + bảng thưởng theo views của từng nhân sự
payroll_periods         → Kỳ lương (tháng/năm, lock tại ngày cụ thể)
payroll_records         → Bảng lương chi tiết từng nhân sự mỗi kỳ
permission_configs      → Director cấu hình ai được xem chỉ số nào (revenue, views, CPM...)
youtube_oauth_tokens    → OAuth token của từng kênh (để gọi Analytics API)
```

### Business Rules quan trọng

1. **Views Snapshot:** Chỉ update khi `(now - last_updated_at) >= 2 ngày`. Không overwrite — INSERT bản ghi mới vào `video_views_log`.
2. **Force Update:** Chỉ Director được trigger force update bất kể điều kiện thời gian.
3. **Kênh inactive:** Video thuộc kênh `inactive` bị excluded khỏi tính lương.
4. **Vai trò video:** Gắn với từng video, không gắn với kênh. 1 người có thể vừa là Writer, vừa là Editor ở 2 video khác nhau trong cùng kênh.
5. **Tỉ trọng:** Manager thiết lập tỉ trọng % theo vai trò cho từng kênh (tổng = 100%).
6. **Công thức thưởng:** `Thưởng = Views × Đơn_giá_per_1000_views × (tỉ_trọng_vai_trò / 100)`
7. **Payroll lock:** Khi Director lock kỳ lương, dùng views tại thời điểm lock (snapshot gần nhất).

---

## 📌 AGENT PROMPT — PHASE 0: DATABASE SCHEMA

```
Bạn là một senior TypeScript developer. Hãy tạo Prisma schema hoàn chỉnh cho dự án YT Payroll Platform với các yêu cầu sau:

## Tech Stack
- Prisma ORM
- PostgreSQL (Supabase)
- TypeScript

## Các Model cần tạo

### 1. User
- id: uuid, primary key
- name: string
- email: string, unique
- password: string (hashed)
- role: enum UserRole { DIRECTOR, MANAGER, STAFF }
- baseSalary: Decimal (lương cứng, default 0)
- isActive: boolean, default true
- createdAt, updatedAt: DateTime
- Quan hệ: channelMemberships, managedChannels, videoRoleAssignments, approvedAssignments

### 2. Channel
- id: uuid, primary key
- youtubeChannelId: string, unique (Channel ID từ YouTube)
- name: string
- description: string?
- status: enum ChannelStatus { PENDING_BKT, ACTIVE, INACTIVE }
- managerId: uuid → User (nullable, Director chỉ định)
- oauthTokenId: uuid → YoutubeOAuthToken (nullable)
- createdBy: uuid → User
- createdAt, updatedAt: DateTime
- Quan hệ: members, videos, weightConfigs

### 3. ChannelMember
- id: uuid
- channelId → Channel
- userId → User
- addedBy: uuid → User (Manager thêm vào)
- joinedAt: DateTime
- Constraint: unique(channelId, userId)

### 4. Video
- id: uuid
- youtubeVideoId: string, unique
- channelId → Channel
- title: string
- thumbnailUrl: string?
- publishedAt: DateTime?
- isActive: boolean, default true (false khi kênh inactive)
- submittedBy: uuid → User (nhân sự paste vào)
- createdAt, updatedAt: DateTime
- Quan hệ: roleAssignments, viewsLog

### 5. VideoRoleAssignment
- id: uuid
- videoId → Video
- userId → User
- role: enum VideoRole { WRITER, EDITOR }
- approvedBy: uuid → User? (Director duyệt)
- approvedAt: DateTime?
- status: enum AssignmentStatus { PENDING, APPROVED, REJECTED }
- createdAt: DateTime
- Constraint: unique(videoId, userId, role)

### 6. VideoViewsLog (APPEND-ONLY)
- id: uuid
- videoId → Video
- viewsCount: BigInt
- revenueEstimate: Decimal? (từ Analytics API, nullable nếu không có quyền)
- recordedAt: DateTime (thời điểm fetch)
- isForcedUpdate: boolean, default false
- createdAt: DateTime
- Không có updatedAt (append-only, không bao giờ sửa)

### 7. ChannelWeightConfig
- id: uuid
- channelId → Channel
- role: enum VideoRole { WRITER, EDITOR }
- weightPercent: Decimal (0-100, tổng các role trong 1 channel phải = 100)
- effectiveFrom: DateTime (hiệu lực từ ngày nào)
- createdBy: uuid → User (Manager thiết lập)
- createdAt: DateTime
- Constraint: unique(channelId, role, effectiveFrom)

### 8. SalaryConfig
- id: uuid
- userId → User
- baseSalary: Decimal
- bonusPerThousandViews: Decimal (thưởng cho mỗi 1000 views)
- effectiveFrom: DateTime
- createdBy: uuid → User
- createdAt: DateTime

### 9. PayrollPeriod
- id: uuid
- month: Int (1-12)
- year: Int
- lockedAt: DateTime? (null = chưa lock)
- lockedBy: uuid → User?
- createdBy: uuid → User
- createdAt: DateTime
- Constraint: unique(month, year)
- Quan hệ: records

### 10. PayrollRecord
- id: uuid
- periodId → PayrollPeriod
- userId → User
- baseSalary: Decimal (snapshot tại thời điểm tính)
- totalViews: BigInt
- totalBonus: Decimal
- totalSalary: Decimal (baseSalary + totalBonus)
- calculatedAt: DateTime
- detail: Json (chi tiết từng video: [{videoId, views, bonus, role, weightPercent}])
- createdAt: DateTime
- Constraint: unique(periodId, userId)

### 11. PermissionConfig
- id: uuid
- metric: enum Metric { REVENUE, VIEWS, CPM, RPM, IMPRESSIONS }
- allowedRoles: enum UserRole[] (PostgreSQL array)
- createdBy: uuid → User
- updatedAt: DateTime
- Constraint: unique(metric)

### 12. YoutubeOAuthToken
- id: uuid
- channelId: string (YouTube channel ID)
- accessToken: string (encrypted)
- refreshToken: string (encrypted)
- expiresAt: DateTime
- scope: string
- createdAt, updatedAt: DateTime

## Yêu cầu bổ sung
- Dùng @default(uuid()) cho tất cả id
- Dùng @default(now()) cho createdAt
- Dùng @updatedAt cho updatedAt
- Đặt tên bảng theo snake_case trong @@map()
- Tạo index cho: channelId, userId, videoId, recordedAt, status
- Thêm enum đầy đủ
- File xuất ra: prisma/schema.prisma
```

---

## 📌 AGENT PROMPT — PHASE 1: PROJECT SETUP

```
Bạn là một senior Next.js developer. Hãy scaffold một Next.js 14 project hoàn chỉnh cho dự án YT Payroll Platform.

## Yêu cầu setup

### 1. Khởi tạo project
- Next.js 14 với App Router
- TypeScript strict mode
- Tailwind CSS
- ESLint + Prettier

### 2. Cài đặt dependencies
Production:
- @prisma/client
- next-auth@beta (Auth.js v5)
- @auth/prisma-adapter
- bcryptjs
- @types/bcryptjs
- zod (validation)
- axios
- date-fns
- lucide-react (icons)

Dev:
- prisma
- @types/node

### 3. Cài đặt shadcn/ui
- Chạy: npx shadcn@latest init
- Theme: zinc
- Cài các components: button, input, label, card, table, badge, dropdown-menu, avatar, sheet, dialog, toast, form, select, tabs

### 4. Cấu trúc thư mục cần tạo
```
/app
  /(auth)
    /login
      page.tsx
  /(dashboard)
    /director
      page.tsx          ← Dashboard giám đốc
      /channels         ← Quản lý kênh
      /staff            ← Quản lý nhân sự
      /payroll          ← Bảng lương
      /analytics        ← Thống kê
      /settings         ← Cấu hình quyền xem
    /manager
      page.tsx          ← Dashboard manager
      /channels         ← Kênh được quản lý
      /team             ← Nhân sự trong kênh
    /staff
      page.tsx          ← Dashboard nhân sự
      /videos           ← Video của tôi
      /salary           ← Lương của tôi
  /api
    /auth
      /[...nextauth]
        route.ts
    /channels
      route.ts          ← GET list, POST create
      /[id]
        route.ts        ← GET, PUT, DELETE
        /members
          route.ts      ← Gán nhân sự
        /weights
          route.ts      ← Tỉ trọng vai trò
    /videos
      route.ts          ← GET list, POST submit
      /[id]
        route.ts
        /approve
          route.ts      ← Director duyệt vai trò
    /views
      /sync
        route.ts        ← Trigger sync views
      /force-update
        route.ts        ← Force update (Director only)
    /payroll
      route.ts
      /calculate
        route.ts
    /cron
      /sync-views
        route.ts        ← Vercel Cron endpoint
/lib
  /db
    index.ts            ← Prisma client singleton
  /auth
    index.ts            ← NextAuth config
    options.ts          ← Auth options, callbacks
  /youtube
    data-api.ts         ← YouTube Data API v3 wrapper
    analytics-api.ts    ← YouTube Analytics API wrapper
  /payroll
    calculator.ts       ← Logic tính lương
    snapshot.ts         ← Views snapshot logic
  /permissions
    checker.ts          ← Permission middleware helper
  /validations
    channel.ts          ← Zod schemas
    video.ts
    payroll.ts
/types
  index.ts              ← Shared TypeScript types
/prisma
  schema.prisma         ← (đã có từ Phase 0)
  seed.ts               ← Seed data cho dev
```

### 5. Cấu hình môi trường
Tạo file .env.example với các biến:
```
DATABASE_URL=
DIRECT_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
YOUTUBE_API_KEY=
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
ENCRYPTION_KEY=
CRON_SECRET=
```

### 6. Tạo file lib/db/index.ts
Prisma client singleton pattern cho Next.js (tránh multiple instances trong dev mode)

### 7. Tạo file types/index.ts
Export các TypeScript types dùng chung:
- UserWithRole
- ChannelWithMembers
- VideoWithAssignments
- PayrollSummary
- DashboardStats

### 8. Cập nhật middleware.ts ở root
- Protected routes: /(dashboard) yêu cầu đăng nhập
- Role-based redirect: Director → /director, Manager → /manager, Staff → /staff
- Public routes: /login, /api/auth

Xuất ra toàn bộ file với nội dung hoàn chỉnh, sẵn sàng chạy.
```

---

## 📌 AGENT PROMPT — PHASE 2: AUTH SYSTEM

```
Bạn là một senior Next.js developer. Implement hệ thống Authentication cho YT Payroll Platform.

## Context
- Next.js 14 App Router
- NextAuth.js v5 (Auth.js)
- Prisma + PostgreSQL
- 3 roles: DIRECTOR, MANAGER, STAFF

## Yêu cầu

### 1. Cấu hình NextAuth (app/api/auth/[...nextauth]/route.ts)
- Provider: Credentials (email + password)
- Adapter: PrismaAdapter
- Session strategy: JWT
- Callbacks:
  - jwt: thêm id, role, name vào token
  - session: map token vào session.user
- Pages: signIn: '/login'

### 2. Trang Login (app/(auth)/login/page.tsx)
UI gồm:
- Logo / tên app ở giữa
- Form: Email input, Password input, Submit button
- Hiển thị lỗi nếu sai credentials
- Loading state khi đang submit
- Dùng shadcn/ui: Card, Input, Label, Button
- Sau đăng nhập: redirect dựa vào role
  - DIRECTOR → /director
  - MANAGER → /manager
  - STAFF → /staff

### 3. Middleware (middleware.ts)
- Bảo vệ tất cả routes trong /(dashboard)
- Kiểm tra role:
  - /director/* chỉ cho DIRECTOR
  - /manager/* chỉ cho MANAGER và DIRECTOR
  - /staff/* cho tất cả đã đăng nhập
- Redirect về /login nếu chưa đăng nhập
- Redirect về dashboard phù hợp nếu sai role

### 4. Server-side session helpers (lib/auth/index.ts)
```typescript
// Các helper functions cần có:
getServerSession()        → Session hiện tại
requireAuth()             → Throw nếu chưa đăng nhập
requireRole(role)         → Throw nếu không đúng role
getCurrentUser()          → User đầy đủ từ DB
```

### 5. Seed Director account (prisma/seed.ts)
Tạo account mẫu:
- Director: director@company.com / Admin@123
- Manager: manager@company.com / Admin@123
- Staff: staff@company.com / Admin@123
Password hash bằng bcryptjs, salt rounds: 10

### 6. Layout cho dashboard (app/(dashboard)/layout.tsx)
- Sidebar navigation responsive
- Show menu items dựa vào role
- User avatar + name + logout ở footer sidebar
- Mobile: hamburger menu

Viết code hoàn chỉnh, có type-safe, có error handling.
```

---

## 📌 AGENT PROMPT — PHASE 3: CHANNEL MANAGEMENT

```
Bạn là một senior Next.js developer. Implement module Quản lý Kênh YouTube cho YT Payroll Platform.

## Context
- Next.js 14 App Router, TypeScript, Prisma, shadcn/ui
- Roles: DIRECTOR (toàn quyền), MANAGER (xem kênh được gán), STAFF (xem kênh được gán)
- Channel status: PENDING_BKT | ACTIVE | INACTIVE

## API Endpoints cần implement

### GET /api/channels
- DIRECTOR: lấy tất cả kênh + thông tin manager + số thành viên
- MANAGER/STAFF: chỉ lấy kênh mình được gán
- Query params: status, search, page, limit
- Response: { channels: Channel[], total, page, totalPages }

### POST /api/channels (DIRECTOR only)
- Body: { youtubeChannelId, name, description?, managerId? }
- Validate youtubeChannelId format
- Tự động fetch channel info từ YouTube Data API
- Response: Channel created

### PUT /api/channels/[id] (DIRECTOR only)
- Cho phép update: name, description, status, managerId
- Khi set status = INACTIVE:
  - Set isActive = false cho tất cả video trong kênh
  - Log hành động vào audit
- Response: Channel updated

### POST /api/channels/[id]/members (MANAGER of channel)
- Body: { userId, action: 'add' | 'remove' }
- Chỉ Manager của kênh đó mới được thêm/xóa member
- Response: updated members list

### GET/POST /api/channels/[id]/weights (MANAGER of channel)
- GET: lấy weight config hiện tại của kênh
- POST body: { configs: [{role: 'WRITER', weightPercent: 60}, {role: 'EDITOR', weightPercent: 40}] }
- Validate: tổng weightPercent phải = 100
- Lưu với effectiveFrom = now()

## UI Pages cần implement

### /director/channels (page.tsx)
Layout:
- Header: "Quản lý Kênh" + Button "Thêm kênh"
- Filter bar: Tìm theo tên, filter theo status
- Table columns: Thumbnail, Tên kênh, Status badge, Manager, Số thành viên, Views tổng, Actions
- Status badge colors: PENDING_BKT=yellow, ACTIVE=green, INACTIVE=gray
- Actions: Edit, Xem chi tiết, Đổi trạng thái

### /director/channels/[id] (page.tsx)
- Tabs: Thông tin | Thành viên | Tỉ trọng | Videos
- Tab "Thông tin": Form edit kênh, chỉ định Manager
- Tab "Thành viên": Danh sách staff, nút thêm/xóa
- Tab "Tỉ trọng": Form nhập % cho WRITER và EDITOR
- Tab "Videos": Danh sách video trong kênh

### /manager/channels (page.tsx)
- Chỉ hiện kênh mình quản lý
- Có thể quản lý members và weight config

## Components cần tạo
- ChannelStatusBadge: Badge với màu theo status
- ChannelCard: Card hiển thị thông tin kênh
- AddChannelDialog: Dialog form thêm kênh mới
- WeightConfigForm: Form nhập tỉ trọng (tự validate tổng = 100%)
- MemberManagementTable: Table quản lý thành viên

Viết code hoàn chỉnh với proper error handling, loading states, toast notifications.
```

---

## 📌 AGENT PROMPT — PHASE 4: VIDEO & ROLE ASSIGNMENT

```
Bạn là một senior Next.js developer. Implement module Quản lý Video và Phân công Vai trò.

## Context
- Nhân sự paste YouTube Video ID → hệ thống fetch metadata
- Director duyệt vai trò từng người trong video
- 1 video có thể có nhiều người (1 Writer + 1 Editor)
- Chỉ video trong kênh ACTIVE mới được tính lương

## API Endpoints

### POST /api/videos (STAFF/MANAGER)
- Body: { videoIds: string[], channelId: string }
- Validate: user phải là member của channel đó
- Fetch metadata từ YouTube Data API v3:
  - title, thumbnailUrl, publishedAt, viewCount
- Tạo Video record + VideoViewsLog đầu tiên
- Response: { created: number, skipped: number, videos: Video[] }

### GET /api/videos (filtered by role)
- DIRECTOR: tất cả video
- MANAGER: video trong kênh mình quản lý
- STAFF: video mình submit
- Filter: channelId, status (pending/approved), dateRange

### POST /api/videos/[id]/roles (STAFF)
- Body: { userId: string, role: 'WRITER' | 'EDITOR' }
- Tạo VideoRoleAssignment với status PENDING
- Một người có thể khai báo nhiều role khác nhau trong các video khác nhau

### PUT /api/videos/[id]/approve (DIRECTOR only)
- Body: { assignments: [{assignmentId, action: 'approve'|'reject'}] }
- Batch approve/reject nhiều assignments cùng lúc
- Response: updated assignments

## UI Pages

### /staff/videos (page.tsx)
- Button "Khai báo Video" → Dialog paste Video IDs + chọn kênh
- Paste textarea cho nhiều Video IDs (mỗi dòng 1 ID)
- Sau khi submit: hiện bảng preview (thumbnail, title, views)
- Confirm → lưu vào DB
- Table: Thumbnail | Tên video | Kênh | Vai trò | Views | Thưởng dự kiến | Trạng thái duyệt

### /director/videos (page.tsx)
- Tab: "Chờ duyệt" | "Đã duyệt" | "Từ chối"
- Table: Thumbnail | Tên video | Kênh | Nhân sự | Vai trò | Views | Actions
- Nút "Duyệt" / "Từ chối" ngay trong table (quick action)
- Batch action: chọn nhiều → duyệt tất cả

## Components
- VideoSubmitDialog: Paste IDs, fetch preview, confirm
- VideoPreviewCard: Hiện thumbnail + title + views
- RoleApprovalTable: Table với inline approve/reject
- VideoStatusBadge: PENDING=yellow, APPROVED=green, REJECTED=red

Viết code hoàn chỉnh với optimistic updates cho approval flow.
```

---

## 📌 AGENT PROMPT — PHASE 5: VIEWS SNAPSHOT ENGINE

```
Bạn là một senior backend engineer. Implement hệ thống Views Snapshot Engine cho YT Payroll Platform.

## Business Rules (QUAN TRỌNG)
1. KHÔNG BAO GIỜ overwrite bản ghi views cũ — chỉ INSERT bản ghi mới
2. Chỉ update khi (now - last recorded_at) >= 2 ngày (48 giờ)
3. Chỉ Director được force update bất kể điều kiện thời gian
4. Video trong kênh INACTIVE: KHÔNG fetch views nữa

## Files cần implement

### lib/youtube/data-api.ts
```typescript
// YouTube Data API v3 wrapper
class YouTubeDataAPI {
  // Fetch video metadata (title, thumbnail, views, publishedAt)
  async getVideoDetails(videoIds: string[]): Promise<VideoDetails[]>
  // Batch fetch, tối đa 50 IDs mỗi request
  // Handle quota exceeded error gracefully
}
```

### lib/payroll/snapshot.ts
```typescript
class ViewsSnapshotService {
  // Lấy danh sách video cần update (điều kiện >= 2 ngày)
  async getVideosNeedingUpdate(): Promise<Video[]>
  
  // Fetch views từ YT API và lưu vào video_views_log
  async snapshotVideo(videoId: string, isForced?: boolean): Promise<ViewsLog>
  
  // Batch snapshot nhiều videos
  async batchSnapshot(videoIds: string[], isForced?: boolean): Promise<SnapshotResult>
  
  // Lấy views mới nhất của 1 video
  async getLatestViews(videoId: string): Promise<ViewsLog | null>
}
```

### API: GET /api/views/sync (Cron Job — internal only)
- Xác thực bằng CRON_SECRET header
- Chạy getVideosNeedingUpdate()
- Batch snapshot với chunk 50 videos mỗi lần
- Log kết quả: { processed, skipped, errors }

### API: POST /api/views/force-update (DIRECTOR only)
- Body: { videoIds?: string[] } (nếu rỗng = update tất cả)
- isForced = true
- Response: { updated: number, errors: [] }

### Vercel Cron Config (vercel.json)
```json
{
  "crons": [{
    "path": "/api/cron/sync-views",
    "schedule": "0 2 */2 * *"
  }]
}
```
Chạy lúc 2 giờ sáng mỗi 2 ngày.

## Error Handling
- YouTube API quota exceeded: log warning, skip, retry next cycle
- Network timeout: retry 3 lần với exponential backoff
- Video không tồn tại (deleted): đánh dấu isActive = false

Viết code với proper TypeScript types, logging, và unit test cho snapshot logic.
```

---

## 📌 AGENT PROMPT — PHASE 6: PAYROLL CALCULATOR

```
Bạn là một senior backend engineer. Implement module Tính lương cho YT Payroll Platform.

## Công thức tính lương

```
Với mỗi video đã được approved:
  latest_views = views mới nhất trong video_views_log
  bonus_per_video = (latest_views / 1000) × bonusPerThousandViews × (weightPercent / 100)

Tổng thưởng nhân sự = Σ bonus_per_video (tất cả video trong kỳ, kênh ACTIVE)
Tổng lương = baseSalary + totalBonus
```

## Files cần implement

### lib/payroll/calculator.ts
```typescript
class PayrollCalculator {
  // Tính lương cho 1 nhân sự trong 1 kỳ
  async calculateForUser(userId: string, periodId: string): Promise<PayrollRecord>
  
  // Tính lương toàn bộ nhân sự trong 1 kỳ
  async calculateAll(periodId: string): Promise<PayrollRecord[]>
  
  // Preview lương (chưa lưu) — dùng cho Staff dashboard
  async preview(userId: string): Promise<PayrollPreview>
}
```

### API: POST /api/payroll/periods (DIRECTOR only)
- Body: { month: number, year: number }
- Tạo PayrollPeriod mới
- Không cho tạo trùng month+year

### POST /api/payroll/periods/[id]/calculate (DIRECTOR only)
- Trigger tính lương cho tất cả nhân sự
- Tính views snapshot tại thời điểm tính
- Lưu detail JSON đầy đủ (mỗi video: videoId, title, views, role, weight, bonus)
- Response: { calculated: number, totalPayroll: Decimal }

### POST /api/payroll/periods/[id]/lock (DIRECTOR only)
- Lock kỳ lương (lockedAt = now)
- Sau khi lock: không cho tính lại
- Response: locked period

### GET /api/payroll/periods/[id]/records (DIRECTOR/MANAGER)
- DIRECTOR: tất cả records
- MANAGER: chỉ nhân sự trong kênh mình
- Response: records với user info

### GET /api/payroll/my-salary (STAFF)
- Lấy lương của mình qua các kỳ
- Breakdown theo video

## UI: /director/payroll (page.tsx)
- Danh sách kỳ lương theo tháng/năm
- Nút "Tạo kỳ lương mới"
- Status: Đang tính | Đã lock
- Nút "Tính lương" → Confirm dialog → Trigger calculate
- Nút "Lock kỳ" (chỉ hiện sau khi đã tính)
- Table nhân sự: Tên | Lương cứng | Views | Thưởng | Tổng | Chi tiết

## UI: /staff/salary (page.tsx)
- Tổng lương tháng này (preview realtime)
- Chart: views theo tuần
- Bảng: từng video → views, vai trò, thưởng dự kiến
- Lịch sử các kỳ lương

Xuất code hoàn chỉnh với proper decimal handling (dùng Decimal.js, không float).
```

---

## 📌 AGENT PROMPT — PHASE 7: ANALYTICS DASHBOARD

```
Bạn là một senior frontend engineer. Implement Analytics Dashboards cho YT Payroll Platform.

## 3 Dashboard cần build

### 1. Director Dashboard (/director/page.tsx)
KPIs (top row):
- Tổng views tháng này (so với tháng trước, % thay đổi)
- Tổng doanh thu ước tính (nếu có quyền xem revenue)
- Số nhân sự đang hoạt động
- Số video đang chờ duyệt (badge đỏ nếu > 0)

Charts (row 2):
- Line chart: Views 30 ngày qua (theo ngày)
- Bar chart: Top 5 kênh theo views tháng này

Tables (row 3):
- Bảng xếp hạng nhân sự (top performers): Tên | Vai trò chính | Views | Thưởng dự kiến
- Bảng nhân sự hiệu suất thấp nhất (bottom 5)

Permission: Các chỉ số revenue/CPM/RPM chỉ hiện nếu user có quyền trong PermissionConfig

### 2. Manager Dashboard (/manager/page.tsx)
- KPIs: Views tổng team | Số nhân sự | Video đã duyệt tháng này
- Line chart: Views của team 30 ngày qua
- Table: Hiệu suất từng nhân sự trong kênh mình
- List: Video mới submit chưa duyệt (cần Director duyệt)

### 3. Staff Dashboard (/staff/page.tsx)
- KPIs: Tổng views của tôi | Thưởng dự kiến | Số video đã duyệt
- Sparkline: Views 7 ngày gần nhất của tôi
- Table: 5 video gần nhất với views realtime
- "Khai báo video mới" CTA button nổi bật

## API Endpoints cho Dashboard

### GET /api/analytics/overview (DIRECTOR)
- Trả về: totalViews, totalRevenue, totalStaff, pendingApprovals
- Comparison: so với period trước (%)

### GET /api/analytics/top-performers?limit=10 (DIRECTOR/MANAGER)
- MANAGER: chỉ nhân sự trong kênh mình
- Trả về: userId, name, totalViews, estimatedBonus, rank

### GET /api/analytics/views-trend?days=30 (based on permission)
- Aggregate views theo ngày
- Trả về: [{date, views, revenue?}]

### GET /api/analytics/my-stats (STAFF)
- Trả về: totalViews, estimatedBonus, videoCount, weeklyViews[]

## Charting Library
Dùng Recharts (đã có trong shadcn/ui ecosystem):
- LineChart cho views trend
- BarChart cho channel comparison
- ResponsiveContainer cho mobile

## Permission-aware UI Pattern
```typescript
// Component wrapper kiểm tra permission trước khi render
<PermissionGate metric="REVENUE">
  <RevenueCard value={revenue} />
</PermissionGate>
// Nếu không có quyền: hiện blur + "Liên hệ giám đốc để xem chỉ số này"
```

Xuất code đầy đủ, responsive, có skeleton loading states.
```

---

## 📌 AGENT PROMPT — PHASE 8: PERMISSION SYSTEM

```
Bạn là một senior backend engineer. Implement Permission Configuration System.

## Yêu cầu

Director có thể cấu hình: chỉ số nào (REVENUE, VIEWS, CPM, RPM, IMPRESSIONS) → role nào được xem.

### API: GET /api/permissions (DIRECTOR only)
- Lấy toàn bộ permission matrix hiện tại
- Response: { [metric]: allowedRoles[] }

### API: PUT /api/permissions (DIRECTOR only)
- Body: { configs: [{metric, allowedRoles: UserRole[]}] }
- Upsert từng metric
- Response: updated configs

### lib/permissions/checker.ts
```typescript
// Server-side permission check
async function canViewMetric(userId: string, metric: Metric): Promise<boolean>

// Middleware factory
function requireMetricPermission(metric: Metric) {
  return async (req, res, next) => { ... }
}

// Client-side hook
function usePermission(metric: Metric): { canView: boolean, loading: boolean }
```

### UI: /director/settings/permissions (page.tsx)
Table với toggle switches:

| Chỉ số      | Director | Manager | Staff |
|-------------|----------|---------|-------|
| Views        | ✅ (lock) | ⬜ toggle | ⬜ toggle |
| Revenue      | ✅ (lock) | ⬜ toggle | ⬜ toggle |
| CPM          | ✅ (lock) | ⬜ toggle | ⬜ toggle |
| RPM          | ✅ (lock) | ⬜ toggle | ⬜ toggle |
| Impressions  | ✅ (lock) | ⬜ toggle | ⬜ toggle |

- Director luôn có quyền xem tất cả (lock, không toggle được)
- Thay đổi auto-save với debounce 500ms
- Toast "Đã lưu" sau khi save

Xuất code hoàn chỉnh.
```

---

## 🗺️ THỨ TỰ THỰC HIỆN

```
PHASE 0 → PHASE 1 → PHASE 2 → PHASE 3 → PHASE 4 → PHASE 5 → PHASE 6 → PHASE 7 → PHASE 8
Database   Setup     Auth      Channels   Videos    Snapshot   Payroll    Dashboard  Permissions
  (1h)     (1h)      (2h)       (3h)       (3h)      (2h)       (3h)       (4h)        (2h)

Tổng ước tính: ~21h coding với AI assistance
```

---

## ⚠️ LƯU Ý KHI DÙNG AGENT PROMPTS

1. **Luôn chạy Phase 0 trước** — DB schema là nền tảng cho mọi thứ
2. **Mỗi Phase là 1 conversation riêng** với Claude Code — paste toàn bộ prompt vào
3. **Sau mỗi Phase**, test kỹ trước khi sang Phase tiếp theo
4. **Nếu có lỗi**, paste error message vào cùng conversation và ghi: *"Tôi gặp lỗi này, hãy fix:"*
5. **Thêm context khi cần**: Paste Prisma schema vào đầu prompt nếu Phase đó cần DB access

Bạn là một senior full-stack engineer. Implement YouTube Analytics Module cho YT Payroll Platform.
Đây là tính năng bổ sung sau khi Phase 1-8 đã hoàn thành.

## MỤC TIÊU
Tạo trang Analytics giống YouTube Studio, nhưng:
1. Chỉ tính trên các video IDs của nhân sự đã submit và được approved
2. Hiển thị actual views + "views thực nhận" theo tỉ trọng vai trò
3. Admin cấu hình metric nào thì role nào được xem
4. Filter theo: 7 ngày, 28 ngày, tháng cụ thể, năm cụ thể

---

## PHẦN 1: CẬP NHẬT DATABASE

### Thêm vào Prisma Schema:
```prisma
model AnalyticsSnapshot {
  id          String   @id @default(uuid())
  videoId     String
  video       Video    @relation(fields: [videoId], references: [id])
  date        DateTime @db.Date      // ngày của snapshot (daily)
  
  // Metrics từ YouTube Analytics API
  views                    BigInt   @default(0)
  estimatedMinutesWatched  Decimal? // watch time in minutes
  averageViewDuration      Decimal? // seconds
  subscribersGained        Int?
  impressions              BigInt?
  impressionCTR            Decimal? // %
  estimatedRevenue         Decimal? // USD
  cpm                      Decimal?
  rpm                      Decimal?
  likes                    Int?
  comments                 Int?

  fetchedAt   DateTime @default(now())
  
  @@unique([videoId, date])
  @@index([videoId])
  @@index([date])
  @@map("analytics_snapshots")
}

model MetricPermission {
  id           String     @id @default(uuid())
  metricKey    String     @unique  // "views", "watchTime", "impressions", etc.
  metricLabel  String               // "Watch time (hours)", "Impressions", etc.
  allowedRoles UserRole[] @default([DIRECTOR])
  isDefault    Boolean    @default(false) // true = hiện mặc định, false = ẩn
  sortOrder    Int        @default(0)
  updatedBy    String
  updatedAt    DateTime   @updatedAt
  
  @@map("metric_permissions")
}
```

Chạy: npx prisma migrate dev --name add_analytics_module

### Seed MetricPermission mặc định (thêm vào prisma/seed.ts):
```typescript
const defaultMetrics = [
  { metricKey: "views", metricLabel: "Views", allowedRoles: ["DIRECTOR","MANAGER","STAFF"], isDefault: true, sortOrder: 1 },
  { metricKey: "watchTime", metricLabel: "Watch time (hours)", allowedRoles: ["DIRECTOR","MANAGER"], isDefault: true, sortOrder: 2 },
  { metricKey: "avgViewDuration", metricLabel: "Average view duration", allowedRoles: ["DIRECTOR","MANAGER"], isDefault: false, sortOrder: 3 },
  { metricKey: "subscribers", metricLabel: "Subscribers gained", allowedRoles: ["DIRECTOR","MANAGER"], isDefault: false, sortOrder: 4 },
  { metricKey: "impressions", metricLabel: "Impressions", allowedRoles: ["DIRECTOR","MANAGER"], isDefault: false, sortOrder: 5 },
  { metricKey: "ctr", metricLabel: "Impression CTR (%)", allowedRoles: ["DIRECTOR","MANAGER"], isDefault: false, sortOrder: 6 },
  { metricKey: "revenue", metricLabel: "Revenue (USD)", allowedRoles: ["DIRECTOR"], isDefault: true, sortOrder: 7 },
  { metricKey: "cpm", metricLabel: "CPM", allowedRoles: ["DIRECTOR"], isDefault: false, sortOrder: 8 },
  { metricKey: "rpm", metricLabel: "RPM", allowedRoles: ["DIRECTOR"], isDefault: false, sortOrder: 9 },
  { metricKey: "likes", metricLabel: "Likes", allowedRoles: ["DIRECTOR","MANAGER","STAFF"], isDefault: false, sortOrder: 10 },
];
```

---

## PHẦN 2: YOUTUBE ANALYTICS API WRAPPER

### Tạo file: lib/youtube/analytics-api.ts
```typescript
// Các date range types
export type DateRangeType = "7days" | "28days" | "month" | "year" | "custom"

export interface DateRange {
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
  label: string
}

export function resolveDateRange(type: DateRangeType, month?: number, year?: number): DateRange {
  const today = new Date()
  // Implement các cases:
  // "7days"  → last 7 days
  // "28days" → last 28 days  
  // "month"  → month/year provided (hoặc current month)
  // "year"   → full year provided (hoặc current year)
}

export interface AnalyticsMetrics {
  date?: string
  views: number
  estimatedMinutesWatched?: number
  averageViewDuration?: number
  subscribersGained?: number
  impressions?: number
  impressionCTR?: number
  estimatedRevenue?: number
  cpm?: number
  rpm?: number
  likes?: number
  comments?: number
}

class YouTubeAnalyticsAPI {
  // Fetch metrics cho 1 video trong 1 date range
  // Dùng YouTube Analytics API v2: youtubeAnalytics.reports.query
  // endpoint: https://youtubeanalytics.googleapis.com/v2/reports
  // Cần: channelId, startDate, endDate, metrics, filters=video=={videoId}
  async getVideoMetrics(
    accessToken: string,
    videoId: string,  // YouTube video ID
    dateRange: DateRange,
    metrics: string[]  // ["views", "estimatedMinutesWatched", ...]
  ): Promise<AnalyticsMetrics[]>  // mảng theo ngày

  // Fetch metrics cho nhiều videos, aggregate theo ngày
  async getMultiVideoMetrics(
    accessToken: string,
    videoIds: string[],
    dateRange: DateRange,
    metrics: string[]
  ): Promise<{ byDate: AnalyticsMetrics[], totals: AnalyticsMetrics }>

  // Map metricKey sang YouTube API metric name
  private mapMetricKey(key: string): string {
    // "views" → "views"
    // "watchTime" → "estimatedMinutesWatched"
    // "avgViewDuration" → "averageViewDuration"
    // "subscribers" → "subscribersGained"
    // "impressions" → "impressions" (Data API)
    // "ctr" → "impressionClickThroughRate"
    // "revenue" → "estimatedRevenue"
    // ...
  }
}
```

---

## PHẦN 3: API ENDPOINTS

### GET /api/analytics/staff-analytics
Query params:
- dateRange: "7days" | "28days" | "month" | "year"
- month?: number (1-12)
- year?: number
- channelId?: string (filter theo kênh, nếu rỗng = tất cả kênh)

Logic:
1. Lấy user hiện tại
2. Lấy tất cả VideoRoleAssignment của user có status = APPROVED
3. Filter video thuộc kênh ACTIVE
4. Lấy MetricPermission → filter metrics user được xem
5. Gọi YouTube Analytics API (dùng OAuth token của từng kênh)
6. Lấy weight config của user trong video đó (role × weightPercent)
7. Tính "weighted views" = views × (weightPercent / 100)
8. Trả về response:
```typescript
interface StaffAnalyticsResponse {
  dateRange: DateRange
  allowedMetrics: MetricPermission[]  // chỉ metrics user có quyền
  
  // Tổng quan (summary cards như YouTube Studio)
  summary: {
    views: { actual: number, weighted: number }
    watchTime?: { actual: number, weighted: number }  // nếu có quyền
    // ... các metric khác tùy permission
  }
  
  // Chart data theo ngày
  chartData: Array<{
    date: string
    views: { actual: number, weighted: number }
    watchTime?: { actual: number, weighted: number }
    // ... tùy permission
  }>
  
  // Breakdown theo video (Top content)
  topVideos: Array<{
    videoId: string
    youtubeVideoId: string
    title: string
    thumbnailUrl: string
    role: "WRITER" | "EDITOR"
    weightPercent: number
    channelName: string
    metrics: {
      views: { actual: number, weighted: number }
      watchTime?: { actual: number, weighted: number }
      // ...
    }
  }>
}
```

### GET /api/analytics/channel-analytics (MANAGER/DIRECTOR)
- Tương tự nhưng lấy tất cả video trong kênh
- Không tính weighted (hiện actual)
- Thêm breakdown theo nhân sự

### GET /api/analytics/available-metrics
- Trả về danh sách metrics user có quyền xem
- Dùng để render metric cards

### GET /api/admin/metric-permissions (DIRECTOR only)
- Lấy toàn bộ MetricPermission config

### PUT /api/admin/metric-permissions (DIRECTOR only)
- Body: { permissions: [{metricKey, allowedRoles[]}] }
- Upsert permissions

---

## PHẦN 4: UI PAGES

### Tạo file: app/(dashboard)/staff/analytics/page.tsx

Layout giống YouTube Studio Analytics:

#### Header section: