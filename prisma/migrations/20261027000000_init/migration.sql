-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "extensions";

-- CreateTable
CREATE TABLE "SolarCalculation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "osmId" TEXT,
    "targetMonthlyKwh" DOUBLE PRECISION NOT NULL,
    "roofAreaM2" DOUBLE PRECISION NOT NULL,
    "maxPanels" INTEGER NOT NULL,
    "recommendedPanels" INTEGER NOT NULL,
    "systemCapacityKw" DOUBLE PRECISION NOT NULL,
    "estMonthlyKwh" DOUBLE PRECISION NOT NULL,
    "monthlyKwh" JSONB NOT NULL,
    "tiltDeg" DOUBLE PRECISION NOT NULL,
    "azimuthDeg" DOUBLE PRECISION NOT NULL,
    "footprint" geometry(Polygon, 4326) NOT NULL,
    "panels" geometry(MultiPolygon, 4326),

    CONSTRAINT "SolarCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SolarCalculation_footprint_idx" ON "SolarCalculation" USING GIST ("footprint");

-- CreateIndex
CREATE INDEX "SolarCalculation_createdAt_idx" ON "SolarCalculation"("createdAt");

