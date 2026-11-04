import { expect, test, vi } from "vitest";
import { createAppearanceService } from "../../lib/services/appearanceService.js";

test("rejects a mismatched account context after the browser session changes in another tab", async () => {
  const updateChatAppearance = vi.fn().mockResolvedValue({ changed: false, appearance: { wallpaperId: "plain", revision: 1 } });
  const service = createAppearanceService({ mongoRepository: { updateChatAppearance }, emitSseEvent: vi.fn() });
  const result = await service.save({ id: "new-account", username: "bob" }, { accountId: "previous-account", wallpaperId: "plain", revision: 0 });
  expect(result.status).toBe(403);
  expect(updateChatAppearance).not.toHaveBeenCalled();
});
