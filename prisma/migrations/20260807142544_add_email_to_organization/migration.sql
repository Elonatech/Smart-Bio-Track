/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Organization` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `Organization` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "email" TEXT;

UPDATE "Organization" SET "email" = 'default@example.com' WHERE "email" IS NULL;

ALTER TABLE "Organization" ALTER COLUMN "email" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Organization_email_key" ON "Organization"("email");
