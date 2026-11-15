import { expect, type Browser, type Page } from "@playwright/test";

/** Signs a new teacher up through the UI and opens a fresh live session. Returns the join code. */
export async function teacherWithSession(page: Page, title: string) {
  await page.goto("/teacher/signup");
  await page.getByLabel("Your name").fill("Ms. Rao");
  await page.getByLabel("Email").fill(`teacher-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@school.test`);
  await page.getByLabel("Password").fill("correct-horse-42");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByTestId("new-session-title").fill(title);
  await page.getByTestId("new-session-submit").click();
  const code = (await page.getByTestId("session-code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  return code;
}

export async function studentJoins(browser: Browser, code: string, name: string) {
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  const page = await ctx.newPage();
  await page.goto(`/join/${code}`);
  await expect(page.getByTestId("join-title")).toBeVisible();
  await page.getByTestId("join-name").fill(name);
  await page.getByTestId("join-submit").click();
  await expect(page.getByTestId("waiting")).toBeVisible();
  return page;
}

export async function askQuestion(teacher: Page, question: string, options: string[], correct: number) {
  await teacher.getByTestId("poll-question").fill(question);
  for (const [i, o] of options.entries()) await teacher.getByTestId(`poll-option-${i}`).fill(o);
  await teacher.getByTestId(`poll-correct-${correct}`).click();
  await teacher.getByTestId("poll-launch").click();
  await expect(teacher.getByTestId("live-poll")).toBeVisible();
}

