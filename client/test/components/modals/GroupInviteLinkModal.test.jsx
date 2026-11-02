import { describe, test, expect } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import GroupInviteLinkModal from "../../../src/components/modals/GroupInviteLinkModal.jsx";

describe("GroupInviteLinkModal", () => {
  test("renders group title, description, and Users icon by default", async () => {
    render(
      <GroupInviteLinkModal
        open={true}
        inviteLink="https://example.com/join/group123"
        onClose={() => {}}
      />,
    );

    const title = page.getByRole("heading", { name: /group created/i });
    await expect.element(title).toBeInTheDocument();
    await expect.element(title.locator("svg.lucide-users")).toBeInTheDocument();

    const description = page.getByText(/join your group/i);
    await expect.element(description).toBeInTheDocument();
  });

  test("renders channel title, description, and Megaphone icon when type is channel", async () => {
    render(
      <GroupInviteLinkModal
        open={true}
        inviteLink="https://example.com/join/channel123"
        type="channel"
        onClose={() => {}}
      />,
    );

    const title = page.getByRole("heading", { name: /channel created/i });
    await expect.element(title).toBeInTheDocument();
    await expect
      .element(title.locator("svg.lucide-megaphone"))
      .toBeInTheDocument();

    const description = page.getByText(/join your channel/i);
    await expect.element(description).toBeInTheDocument();
  });
});
