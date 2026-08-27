/*
  Warnings:

  - You are about to drop the column `organizationName` on the `PendingOrganizationSignup` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `PendingOrganizationSignup` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "PendingOrganizationSignup_organizationName_key";

-- AlterTable
ALTER TABLE "PendingOrganizationSignup" DROP COLUMN "organizationName",
DROP COLUMN "status";
