import { z } from "zod";

export const createChannelSchema = z.object({
  youtubeChannelId: z
    .string()
    .min(1, "Channel ID không được để trống")
    .regex(/^UC[\w-]{22}$/, "YouTube Channel ID không hợp lệ (phải bắt đầu bằng UC)"),
  name: z.string().min(1, "Tên kênh không được để trống").max(100),
  description: z.string().max(500).optional(),
  managerId: z.string().uuid().optional(),
});

export const updateChannelSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(["PENDING_BKT", "ACTIVE", "INACTIVE"]).optional(),
  managerId: z.string().uuid().nullable().optional(),
});

export const channelMemberSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["add", "remove"]),
});

export const weightConfigSchema = z.object({
  configs: z
    .array(
      z.object({
        role: z.enum(["WRITER", "EDITOR"]),
        weightPercent: z.number().min(0).max(100),
      })
    )
    .length(2)
    .refine(
      (configs) => configs.reduce((sum, c) => sum + c.weightPercent, 0) === 100,
      { message: "Tổng tỉ trọng phải bằng 100%" }
    ),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>;
export type ChannelMemberInput = z.infer<typeof channelMemberSchema>;
export type WeightConfigInput = z.infer<typeof weightConfigSchema>;
