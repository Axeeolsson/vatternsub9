import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const root = new URL("../", import.meta.url).pathname;
const vite = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const {
    buildPersonalizedPlan,
    calendarWeekRanges,
    isoWeekday,
  } = await vite.ssrLoadModule("/src/lib/personalizedPlan.ts");
  const { weekOfDate } = await vite.ssrLoadModule("/src/lib/planEngine.ts");

  const monday = buildPersonalizedPlan("2026-08-24");
  assert.equal(monday.weeks.length, 43);
  assert.equal(monday.weeks[0].startDateISO, "2026-08-24");
  assert.deepEqual(calendarWeekRanges("2026-08-24", "2026-08-30"), [
    { start: "2026-08-24", end: "2026-08-30" },
  ]);

  const wednesday = buildPersonalizedPlan("2026-08-26");
  assert.equal(wednesday.weeks[0].startDateISO, "2026-08-26");
  assert.equal(wednesday.weeks[0].dateRange, "26/8 - 30/8");
  assert.equal(wednesday.weeks[1].startDateISO, "2026-08-31");
  assert.equal(wednesday.weeks[1].dateRange, "31/8 - 6/9");
  assert.ok(
    wednesday.weeks[0].sessions.every(
      (session) => session.date >= "2026-08-26" && session.date <= "2026-08-30"
    )
  );

  const sunday = buildPersonalizedPlan("2026-08-30");
  assert.equal(sunday.weeks[0].startDateISO, "2026-08-30");
  assert.equal(sunday.weeks[0].dateRange, "30/8 - 30/8");
  assert.equal(sunday.weeks[0].sessions.length, 1);
  assert.equal(sunday.weeks[0].sessions[0].date, "2026-08-30");
  assert.equal(sunday.weeks[0].sessions[0].dayOfWeek, 7);
  assert.equal(sunday.weeks[1].startDateISO, "2026-08-31");
  assert.equal(sunday.weeks[1].dateRange, "31/8 - 6/9");

  for (const plan of [monday, wednesday, sunday]) {
    const sessions = plan.weeks.flatMap((week) => week.sessions);
    assert.ok(
      sessions.every((session) => session.dayOfWeek === isoWeekday(session.date)),
      "dayOfWeek must equal the real ISO weekday"
    );
    assert.ok(sessions.every((session) => session.date >= plan.startDateISO));
    assert.ok(sessions.every((session) => session.date <= plan.raceDateISO));
    assert.ok(
      sessions.some(
        (session) =>
          session.title === "Vätternrundan" &&
          session.date === plan.raceDateISO
      )
    );
    assert.equal(plan.weeks.at(-1).phaseShort, "Racevecka");
    assert.equal(plan.weeks.at(-1).dateRange.split(" - ")[1], "18/6");
    assert.equal(
      plan.weeks.filter((week) =>
        week.phase.toLowerCase().includes("nedtrappning")
      ).length,
      3
    );
  }

  assert.equal(
    weekOfDate("2026-08-30", { planStartDate: "2026-08-30" }),
    1
  );
  assert.equal(
    weekOfDate("2026-08-31", { planStartDate: "2026-08-30" }),
    2
  );

  const late = buildPersonalizedPlan("2026-09-01");
  assert.ok(late.weeks.length < 43);
  assert.ok(late.weeks[0].sessions.every((session) => session.date >= "2026-09-01"));
  assert.equal(late.weeks.at(-1).phaseShort, "Racevecka");

  const scheduleSource = await readFile(
    new URL("../src/screens/Schedule.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(!scheduleSource.includes('from "../data/plan.seed"'));
  assert.ok(scheduleSource.includes("personalizedPlanForSettings"));
  assert.ok(scheduleSource.includes("plan.weeks.length"));

  console.log(
    `Personalized plan tests passed: Monday=${monday.weeks.length}, Wednesday=${wednesday.weeks.length}, Sunday=${sunday.weeks.length} calendar weeks.`
  );
} finally {
  await vite.close();
}

