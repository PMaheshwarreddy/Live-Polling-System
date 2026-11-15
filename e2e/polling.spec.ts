import { expect, test } from "@playwright/test";
import { askQuestion, studentJoins, teacherWithSession } from "./helpers";

test("a full live class: join, answer, reveal, chat, refresh, kick, report", async ({ page: teacher, browser }) => {
  const code = await teacherWithSession(teacher, "Biology · Period 3");

  const asha = await studentJoins(browser, code, "Asha");
  const ben = await studentJoins(browser, code, "Ben");
  await expect(teacher.getByTestId("participant")).toHaveCount(2);
  await expect(teacher.getByTestId("online-count")).toHaveText("2");

  // --- Question 1: both answer, poll ends on its own when everyone has answered ---
  await askQuestion(teacher, "Where does the Calvin cycle happen?", ["Stroma", "Thylakoid", "Mitochondria", "Nucleus"], 0);
  for (const s of [asha, ben]) await expect(s.getByTestId("question")).toContainText("Calvin cycle");
  await asha.getByTestId("answer-0").click();
  await expect(asha.getByTestId("locked")).toBeVisible();
  await expect(teacher.getByTestId("live-progress")).toHaveText("1 of 2 answered");
  await ben.keyboard.press("2"); // keyboard shortcut answers option B

  await expect(asha.getByTestId("verdict")).toHaveText(/Correct/);
  await expect(ben.getByTestId("verdict")).toHaveText("Not quite");
  await expect(ben.getByTestId("reveal")).toContainText("The answer was “Stroma”");
  await expect(teacher.getByTestId("history-item")).toHaveCount(1);
  await expect(teacher.getByTestId("history-item").first()).toContainText("50% correct");
  await expect(asha.getByTestId("score")).toHaveText("1/1");

  // --- Chat both ways ---
  await teacher.getByRole("tab", { name: /Chat/ }).click();
  await teacher.getByLabel("Chat message").fill("Great work everyone!");
  await teacher.getByRole("button", { name: "Send" }).click();
  await expect(ben.getByText("Great work everyone!")).toBeVisible();
  await ben.getByLabel("Chat message").fill("Thanks!");
  await ben.getByRole("button", { name: "Send" }).click();
  await expect(teacher.getByText("Thanks!")).toBeVisible();

  // --- Question 2: a student refreshes mid-question and resumes, teacher ends early ---
  await askQuestion(teacher, "Which gas is released by photosynthesis?", ["Oxygen", "Carbon dioxide", "Nitrogen"], 0);
  await asha.getByTestId("answer-0").click();
  await asha.reload();
  await expect(asha.getByTestId("question")).toBeVisible();
  await expect(asha.getByTestId("locked")).toBeVisible(); // the server remembered the answer
  await teacher.getByTestId("poll-end").click();
  await expect(asha.getByTestId("verdict")).toHaveText(/Correct/);
  await expect(ben.getByTestId("verdict")).toHaveText("Time's up");
  await expect(asha.getByTestId("score")).toHaveText("2/2");

  // --- Kick ---
  await teacher.getByRole("tab", { name: /People/ }).click();
  teacher.once("dialog", (d) => void d.accept());
  await teacher.getByRole("button", { name: "Remove Ben" }).click({ force: true });
  await expect(ben.getByTestId("end-screen")).toContainText("You were removed");
  await expect(teacher.getByTestId("participant")).toHaveCount(1);

  // --- Report ---
  await teacher.getByRole("link", { name: "Report" }).click();
  await expect(teacher.getByTestId("kpi").first()).toContainText("75%"); // (50% + 100%) / 2
  await expect(teacher.getByTestId("report-student")).toHaveCount(2);
  await expect(teacher.getByTestId("report-student").first()).toContainText("Asha");
  await expect(teacher.getByTestId("report-student").first()).toContainText("2/2");

  // --- Closing the session ends it for students ---
  await teacher.goBack();
  teacher.once("dialog", (d) => void d.accept());
  await teacher.getByRole("button", { name: "End", exact: true }).click();
  await expect(asha.getByTestId("end-screen")).toContainText("That's a wrap");
});

test("joining with a wrong code shows a clear error", async ({ page }) => {
  await page.goto("/join/ZZZ-999");
  await expect(page.getByText("No session with that code")).toBeVisible();
  await expect(page.getByTestId("join-submit")).toBeDisabled();
});
