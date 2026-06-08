-- CreateTable
CREATE TABLE "OrgVersion" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgDraft" (
    "id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgDraft_pkey" PRIMARY KEY ("id")
);
