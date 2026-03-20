import { z } from "zod";

export const submitVideosSchema = z.object({
  videoIds: z
    .array(z.string().regex(/^[a-zA-Z0-9_-]{11}$/, "YouTube Video ID không hợp lệ"))
    .min(1, "Phải có ít nhất 1 Video ID")
    .max(50, "Tối đa 50 video mỗi lần"),
  channelId: z.string().uuid("Channel ID không hợp lệ"),
});

export const videoRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["WRITER", "EDITOR"]),
});

export const approveAssignmentsSchema = z.object({
  assignments: z.array(
    z.object({
      assignmentId: z.string().uuid(),
      action: z.enum(["approve", "reject"]),
    })
  ).min(1),
});

export type SubmitVideosInput = z.infer<typeof submitVideosSchema>;
export type VideoRoleInput = z.infer<typeof videoRoleSchema>;
export type ApproveAssignmentsInput = z.infer<typeof approveAssignmentsSchema>;
