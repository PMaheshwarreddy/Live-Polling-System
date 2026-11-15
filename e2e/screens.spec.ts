import path from "node:path";
import { expect, test } from "@playwright/test";
import { askQuestion, studentJoins, teacherWithSession } from "./helpers";

/** Captures the main screens for the README / visual review. Run with: SCREENS=1 npm run e2e -- screens */
test.skip(!process.env.SCREENS, "set SCREENS=1 to capture screenshots");
test.setTimeout(10 * 60_000);
const out = (name: string) => path.resolve("e2e/screens", `${name}.png`);

test("capture screens", async ({ page: teacher, browser }) => {
  await teacher.goto("/");
  await teacher.waitForTimeout(5600);
  await teacher.screenshot({ path: out("01-landing") });

  const code = await teacherWithSession(teacher, "Biology · Period 3");
  await teacher.goto("/teacher");
  await teacher.getByTestId("doc-upload").setInputFiles(path.resolve("packages/evals/data/energy-in-cells.md"));
  await expect(teacher.getByTestId("doc-status").first()).toHaveText(/chunks/, { timeout: 60_000 });
  await teacher.screenshot({ path: out("02-dashboard") });
  await teacher.getByRole("button", { name: /Concept map for/ }).click();
  await teacher.waitForTimeout(500);
  await teacher.screenshot({ path: out("03-concept-map") });
  await teacher.keyboard.press("Escape");
  await teacher.getByRole("link", { name: /Open console/ }).first().click();

  const names = ["Asha", "Ben", "Chen", "Dara"];
  const students = [];
  for (const n of names) students.push(await studentJoins(browser, code, n));
  await students[0]!.screenshot({ path: out("04-student-waiting") });

  await teacher.getByTestId("tab-ai").click();
  await teacher.getByTestId("attach-doc").first().click();
  await teacher.getByTestId("ai-topic").fill("cellular respiration");
  await teacher.getByTestId("ai-count-2").click();
  await teacher.getByTestId("ai-generate").click();
  await expect(teacher.getByTestId("ai-question")).toHaveCount(2, { timeout: 6 * 60_000 });
  await teacher.screenshot({ path: out("05-teacher-ai-quiz"), fullPage: true });

  await teacher.getByRole("tab", { name: /Write a question/ }).click();
  await askQuestion(teacher, "Where does the Calvin cycle take place?", ["Stroma", "Thylakoid membrane", "Mitochondria", "Cytoplasm"], 0);
  await students[0]!.getByTestId("answer-0").click();
  await students[1]!.getByTestId("answer-1").click();
  await students[2]!.screenshot({ path: out("06-student-question") });
  await teacher.screenshot({ path: out("07-teacher-live") });
  const present = await teacher.context().newPage();
  await present.goto(teacher.url() + "/present");
  await present.waitForTimeout(800);
  await present.screenshot({ path: out("08-present-live") });
  await students[2]!.getByTestId("answer-0").click();
  await students[3]!.getByTestId("answer-1").click();
  await expect(students[0]!.getByTestId("reveal")).toBeVisible();
  await students[0]!.waitForTimeout(1500);
  await students[0]!.screenshot({ path: out("09-student-correct") });
  await students[1]!.screenshot({ path: out("10-student-wrong") });
  await present.waitForTimeout(1200);
  await present.screenshot({ path: out("11-present-results") });
  await expect(teacher.getByTestId("insight")).toContainText("answered correctly", { timeout: 4 * 60_000 });
  await teacher.waitForTimeout(800);
  await teacher.screenshot({ path: out("12-teacher-results-insight"), fullPage: true });

  const s = students[1]!;
  await s.getByTestId("tab-tutor").click();
  await s.getByTestId("tutor-input").fill("Why does the Calvin cycle need ATP?");
  await s.getByRole("button", { name: "Ask the tutor" }).click();
  await expect(s.getByTestId("tutor-answer").last().locator(".citation").first()).toBeVisible({ timeout: 5 * 60_000 });
  await s.getByTestId("tutor-answer").last().scrollIntoViewIfNeeded();
  await s.screenshot({ path: out("13-student-tutor"), fullPage: true });

  await teacher.getByRole("link", { name: "Report" }).click();
  await expect(teacher.getByTestId("kpi").first()).toBeVisible();
  await teacher.waitForTimeout(900);
  await teacher.screenshot({ path: out("14-report") });
  await teacher.emulateMedia({ colorScheme: "dark" });
  await teacher.screenshot({ path: out("15-report-dark") });
  await teacher.goBack();
  await teacher.waitForTimeout(800);
  await teacher.screenshot({ path: out("16-teacher-console-dark") });
});
