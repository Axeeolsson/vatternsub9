import assert from "node:assert/strict";
import { createServer } from "vite";

const root = new URL("../", import.meta.url).pathname;
const vite = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const {
    estimateFtpFromPowerEffort,
    estimateFtpFromQuestionnaire,
  } = await vite.ssrLoadModule("/src/lib/ftpEstimator.ts");

  const beginner = estimateFtpFromQuestionnaire({
    weightKg: 70,
    experience: "new",
    weeklyHours: "under1",
    weeklySessions: "under2",
    longestRide: "under45",
    qualitySessions: "0",
  });
  assert.equal(beginner.ftp, 85);
  assert.equal(beginner.confidence, "låg");
  assert.ok(beginner.low < beginner.ftp && beginner.high > beginner.ftp);

  const trained = estimateFtpFromQuestionnaire({
    weightKg: 80,
    experience: "experienced",
    weeklyHours: "over8",
    weeklySessions: "over4",
    longestRide: "over180",
    qualitySessions: "2plus",
  });
  assert.equal(trained.ftp, 300);

  const twentyMinutes = estimateFtpFromPowerEffort(250, 20);
  assert.equal(twentyMinutes.ftp, 237);
  assert.equal(twentyMinutes.confidence, "medel");

  const eightMinutes = estimateFtpFromPowerEffort(300, 8);
  assert.ok(eightMinutes.high - eightMinutes.low > twentyMinutes.high - twentyMinutes.low);

  const lowBoundary = estimateFtpFromQuestionnaire({
    weightKg: 35,
    experience: "new",
    weeklyHours: "under1",
    weeklySessions: "under2",
    longestRide: "under45",
    qualitySessions: "0",
  });
  assert.equal(lowBoundary.ftp, 80);
  assert.equal(estimateFtpFromPowerEffort(800, 8).ftp, 600);

  console.log("FTP estimator tests passed.");
} finally {
  await vite.close();
}
