-- CreateTable
CREATE TABLE "BuildingTile" (
    "key" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL,
    "features" JSONB NOT NULL,

    CONSTRAINT "BuildingTile_pkey" PRIMARY KEY ("key")
);
