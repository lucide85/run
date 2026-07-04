-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
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
    "homeLat" REAL,
    "homeLon" REAL,
    "homePlace" TEXT,
    "limitHistoryToPlan" BOOLEAN NOT NULL DEFAULT false,
    "raceName" TEXT,
    "raceDate" DATETIME,
    "trainingDaysJson" TEXT,
    "onboardingAnswersJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("createdAt", "email", "garminEmail", "garminPasswordEnc", "garminSessionJson", "homeLat", "homeLon", "homePlace", "id", "lastGarminSync", "maxHr", "mustOnboard", "nickname", "onboardingAnswersJson", "passwordHash", "raceDate", "raceName", "restHr", "role", "trainingDaysJson", "watchModel") SELECT "createdAt", "email", "garminEmail", "garminPasswordEnc", "garminSessionJson", "homeLat", "homeLon", "homePlace", "id", "lastGarminSync", "maxHr", "mustOnboard", "nickname", "onboardingAnswersJson", "passwordHash", "raceDate", "raceName", "restHr", "role", "trainingDaysJson", "watchModel" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
