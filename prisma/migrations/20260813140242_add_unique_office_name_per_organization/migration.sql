/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,name]` on the table `Office` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Office_organizationId_name_key" ON "Office"("organizationId", "name");
