import { mkdirSync, renameSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { studentJoins, teacherWithSession } from "./helpers";

/**
 * Records the README demo: the teacher's console and a student's phone, side by side.
 *   DEMO=1 npm run e2e -- demo   →  e2e/screens/demo-teacher.webm + demo-student.webm
 * Then run e2e/make-demo-gif.sh to stitch them into docs/demo.gif.
 */
test.skip(!process.env.DEMO, "set DEMO=1 to record the demo video");
test.setTimeout(5 * 60_000);

test("record demo", async ({ browser }) => {
  const outDir = path.resolve("e2e/screens");
  mkdirSync(outDir, { recursive: true });

  // Setup happens off camera: sign up, create a session, let a few classmates join.
  const setupTeacher = await (await browser.newContext()).newPage();
  const code = await teacherWithSession(setupTeacher, "Biology · Period 3");
  const consoleUrl = setupTeacher.url();
  const setupStudent = await studentJoins(browser, code, "Asha");
  const classmates = [];
  for (const n of ["Ben", "Chen", "Dara", "Elif"]) classmates.push(await studentJoins(browser, code, n));
  const teacherState = await setupTeacher.context().storageState();
  const studentState = await setupStudent.context().storageState();
  await setupStudent.context().close(); // the recorded phone takes over Asha's seat

  // Both recordings start at the same moment so they line up frame for frame.
  const tCtx = await browser.newContext({ storageState: teacherState, viewport: { width: 1280, height: 860 }, recordVideo: { dir: outDir, size: { width: 1280, height: 860 } } });
  const sCtx = await browser.newContext({ storageState: studentState, viewport: { width: 400, height: 860 }, deviceScaleFactor: 1, recordVideo: { dir: outDir, size: { width: 400, height: 860 } } });
  const teacher = await tCtx.newPage();
  const phone = await sCtx.newPage();
  await Promise.all([teacher.goto(consoleUrl), phone.goto(`/s/${code}`)]);
  await expect(phone.getByTestId("waiting")).toBeVisible();
  await expect(teacher.getByTestId("online-count")).toHaveText("5");
  await teacher.waitForTimeout(1200);

  // The teacher writes a question live.
  await teacher.getByTestId("poll-question").pressSequentially("Where does the Calvin cycle take place?", { delay: 35 });
  for (const [i, o] of ["Stroma", "Thylakoid membrane", "Mitochondria", "Cytoplasm"].entries())
    await teacher.getByTestId(`poll-option-${i}`).pressSequentially(o, { delay: 25 });
  await teacher.getByTestId("poll-correct-0").click();
  await teacher.waitForTimeout(400);
  await teacher.getByTestId("poll-launch").click();

  // Answers trickle in; the teacher's progress bar fills live.
  await expect(phone.getByTestId("question")).toBeVisible();
  await phone.waitForTimeout(1500);
  await phone.getByTestId("answer-0").click();
  const picks = [1, 0, 0, 1];
  for (const [i, s] of classmates.entries()) {
    await teacher.waitForTimeout(900);
    await s.getByTestId(`answer-${picks[i]}`).click();
  }
  await expect(phone.getByTestId("verdict")).toHaveText(/Correct/);
  await teacher.waitForTimeout(1200);
  // Show the teacher's revealed results and the AI insight starting to work.
  await teacher.evaluate(() => {
    const el = document.querySelector('[data-testid="history-item"]');
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  });
  await teacher.waitForTimeout(4500);

  const tVideo = teacher.video()!;
  const sVideo = phone.video()!;
  await tCtx.close();
  await sCtx.close();
  renameSync(await tVideo.path(), path.join(outDir, "demo-teacher.webm"));
  renameSync(await sVideo.path(), path.join(outDir, "demo-student.webm"));
});
