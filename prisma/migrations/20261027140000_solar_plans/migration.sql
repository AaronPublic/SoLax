-- CreateTable
CREATE TABLE "SolarPlan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "osmId" TEXT,
    "targetMonthlyKwh" DOUBLE PRECISION NOT NULL,
    "recommendedPanels" INTEGER NOT NULL,
    "maxPanels" INTEGER NOT NULL,
    "systemCapacityKw" DOUBLE PRECISION NOT NULL,
    "estMonthlyKwh" DOUBLE PRECISION NOT NULL,
    "coveragePct" DOUBLE PRECISION NOT NULL,
    "roofAreaM2" DOUBLE PRECISION NOT NULL,
    "result" JSONB NOT NULL,
    "footprint" geometry(Polygon, 4326) NOT NULL,

    CONSTRAINT "SolarPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolarPlan_userId_createdAt_idx" ON "SolarPlan"("userId", "createdAt");

-- Row-level security (hand-written).
-- Supabase exposes the public schema through its REST API to anyone holding the publishable key.
-- RLS with no policies denies that API every row; the app connects as the table owner through
-- Prisma, which bypasses RLS, and enforces per-user access in its own API routes.
ALTER TABLE "SolarPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SolarCalculation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BuildingTile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
