-- CreateTable
CREATE TABLE "PendingOrganizationSignup" (
    "id" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "PendingOrganizationSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingOrganizationSignup_organizationName_key" ON "PendingOrganizationSignup"("organizationName");

-- CreateIndex
CREATE UNIQUE INDEX "PendingOrganizationSignup_email_key" ON "PendingOrganizationSignup"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PendingOrganizationSignup_tokenHash_key" ON "PendingOrganizationSignup"("tokenHash");
