-- DropForeignKey
ALTER TABLE "videos" DROP CONSTRAINT "videos_submittedBy_fkey";

-- AlterTable
ALTER TABLE "videos" ALTER COLUMN "submittedBy" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
