import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import CrmTaskModal from "../../../src/components/modals/CrmTaskModal.jsx";
import { setLocale } from "../../../src/i18n/locale.js";
import "../../../src/index.css";

afterEach(() => {
  vi.restoreAllMocks();
  setLocale("en");
});

test("creates a CRM task without sending conversation content and exposes the Web task id", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
    JSON.stringify({ task: { id: "web-task-42" } }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  ));
  const close = vi.fn();
  await render(<CrmTaskModal open conversationId="chat-123" onClose={close} />);

  await page.getByRole("textbox", { name: "Task title", exact: true }).fill("Call the seller");
  await page.getByRole("textbox", { name: "Instructions", exact: true }).fill("Confirm viewing time");
  await page.getByLabelText("Due date", { exact: true }).fill("2027-01-02T10:00");
  await page.getByRole("button", { name: "Create task", exact: true }).click();

  await expect.element(page.getByText("CRM task created", { exact: true })).toBeVisible();
  await expect.element(page.getByText("web-task-42", { exact: true })).toBeVisible();
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/integrations/crm/tasks");
  expect(options.credentials).toBe("include");
  const body = JSON.parse(options.body);
  expect(body).toEqual({
    conversationId: "chat-123",
    task: {
      type: "call",
      title: "Call the seller",
      priority: "normal",
      dueAt: "2027-01-02T06:30:00.000Z",
      instructions: "Confirm viewing time",
      steps: [{ title: "Call the seller", required: true }],
    },
  });
  expect(JSON.stringify(body)).not.toContain("message");
});
