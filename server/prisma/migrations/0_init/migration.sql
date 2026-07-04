-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "mustOnboard" BOOLEAN NOT NULL DEFAULT true,
    "garminEmail" TEXT,
    "garminPasswordEnc" TEXT,
    "garminSessionJson" TEXT,
    "lastGarminSync" DATETIME,
    "maxHr" INTEGER NOT NULL DEFAULT 195,
    "restHr" INTEGER NOT NULL DEFAULT 50,
    "watchModel" TEXT,
    "raceName" TEXT,
    "raceDate" DATETIME,
    "trainingDaysJson" TEXT,
    "onboardingAnswersJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PlannedSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "week" INTEGER NOT NULL,
    "phase" INTEGER NOT NULL,
    "phaseName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "targetZone" TEXT,
    "targetPaceMinSec" INTEGER,
    "targetPaceMaxSec" INTEGER,
    "plannedDistanceKm" REAL,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "aiAdjusted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "watchTips" TEXT,
    "watchTipsFor" TEXT,
    "workoutId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlannedSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlannedSession_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Workout" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "garminActivityId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "sport" TEXT,
    "name" TEXT,
    "distanceKm" REAL,
    "durationSec" INTEGER,
    "avgHr" INTEGER,
    "maxHr" INTEGER,
    "avgPaceSecPerKm" INTEGER,
    "elevationGainM" REAL,
    "avgCadence" INTEGER,
    "calories" INTEGER,
    "hrZoneSecondsJson" TEXT,
    "streamsJson" TEXT,
    "lapsJson" TEXT,
    "rawType" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Workout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IgnoredActivity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "garminActivityId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IgnoredActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workoutId" INTEGER,
    "plannedSessionId" INTEGER,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'chat',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiMessage_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AiMessage_plannedSessionId_fkey" FOREIGN KEY ("plannedSessionId") REFERENCES "PlannedSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeightLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "date" DATETIME NOT NULL,
    "weightKg" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeightLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanChange" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" TEXT NOT NULL,
    "diffJson" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "PlanChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedSession_workoutId_key" ON "PlannedSession"("workoutId");

-- CreateIndex
CREATE INDEX "PlannedSession_userId_idx" ON "PlannedSession"("userId");

-- CreateIndex
CREATE INDEX "Workout_userId_idx" ON "Workout"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Workout_userId_garminActivityId_key" ON "Workout"("userId", "garminActivityId");

-- CreateIndex
CREATE INDEX "IgnoredActivity_userId_idx" ON "IgnoredActivity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "IgnoredActivity_userId_garminActivityId_key" ON "IgnoredActivity"("userId", "garminActivityId");

-- CreateIndex
CREATE INDEX "WeightLog_userId_idx" ON "WeightLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WeightLog_userId_date_key" ON "WeightLog"("userId", "date");

-- CreateIndex
CREATE INDEX "PlanChange_userId_idx" ON "PlanChange"("userId");

