import path from "node:path";
import { expect, test } from "@playwright/test";
import { studentJoins } from "./helpers";

/**
 * The AI path with real local models (Ollama): upload → index → generate a question → launch it →
 * insight → student tutor. Slow on a CPU, so the timeouts are generous.
 */
test.setTimeout(15 * 60_000);

test("local AI: index notes, generate a quiz, insight, grounded tutor", async ({ page: teacher, browser }) => {
  await teacher.goto("/teacher/signup");
  await teacher.getByLabel("Your name").fill("Mr. Okafor");
  await teacher.getByLabel("Email").fill(`ai-${Date.now()}@school.test`);
  await teacher.getByLabel("Password").fill("correct-horse-42");
  await teacher.getByRole("button", { name: "Create account" }).click();
  await expect(teacher.getByTestId("ai-status")).toHaveText(/Local AI ready/);

  // Upload course notes; the worker chunks, embeds and builds the concept graph.
  await teacher.getByTestId("doc-upload").setInputFiles(path.resolve("packages/evals/data/energy-in-cells.md"));
  await expect(teacher.getByTestId("doc-status").first()).toHaveText(/\d+ chunks · \d+ concepts/, { timeout: 60_000 });
  await teacher.getByRole("button", { name: /Concept map for/ }).click();
  await expect(teacher.getByRole("img", { name: "Concept map" })).toBeVisible();
  await expect(teacher.getByRole("img", { name: "Concept map" })).toContainText("calvin cycle");
  await teacher.keyboard.press("Escape");

  await teacher.getByTestId("new-session-title").fill("Biology · AI demo");
  await teacher.getByTestId("new-session-submit").click();
  const code = (await teacher.getByTestId("session-code").textContent())!.trim();
  const student = await studentJoins(browser, code, "Chen");

  // Attach the notes so the tutor turns on, then generate one question from them.
  await teacher.getByTestId("tab-ai").click();
  await teacher.getByTestId("attach-doc").first().click();
  await expect(teacher.getByText("Tutor on", { exact: true })).toBeVisible();
  await teacher.getByTestId("ai-topic").fill("the Calvin cycle");
  await teacher.getByTestId("ai-count-1").click();
  await teacher.getByTestId("ai-generate").click();
  const card = teacher.getByTestId("ai-question").first();
  await expect(card).toBeVisible({ timeout: 6 * 60_000 });
  await expect(card).toContainText(/Energy in cells ›/); // citation back to the source document

  // Launch it; the student answers; the poll ends and the insight arrives.
  await card.getByTestId("ai-question-launch").click();
  await expect(student.getByTestId("question")).toBeVisible();
  await student.getByTestId("tab-tutor").click();
  await expect(student.getByTestId("tutor-input")).toBeDisabled(); // paused while a question is live
  await student.getByTestId("answer-0").click();
  await expect(student.getByTestId("reveal")).toBeVisible();
  await expect(teacher.getByTestId("insight")).toContainText("answered correctly", { timeout: 4 * 60_000 });

  // Grounded tutor with streaming + citations.
  await expect(student.getByTestId("tutor-input")).toBeEnabled();
  await student.getByTestId("tutor-input").fill("Why do plants give off carbon dioxide at night?");
  await student.getByRole("button", { name: "Ask the tutor" }).click();
  const answer = student.getByTestId("tutor-answer").last();
  await expect(answer).toContainText(/respir/i, { timeout: 5 * 60_000 });
  await expect(answer.locator(".citation").first()).toBeVisible({ timeout: 5 * 60_000 });
});
