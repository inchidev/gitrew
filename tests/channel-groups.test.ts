import { describe, expect, it } from "vitest";
import { channelSections } from "../app/lib/channel-groups";
import type { Channel } from "../shared/chat";

function channel(id: string, name: string, category?: string): Channel {
  return {
    id,
    name,
    description: `${name} stuff`,
    kind: "public",
    ...(category ? { category: { name: category, emoji: `:${category}:` } } : {}),
  };
}

describe("channelSections", () => {
  it("keeps server order and normalizes a single section", () => {
    const groups = channelSections(
      [
        channel("1", "welcome", "Announcements"),
        channel("2", "ideas", "Ideas"),
        channel("3", "bugs", "Ideas"),
      ],
      "",
      true,
    );
    expect(groups.map((section) => [section.label, section.items.map((i) => i.id)])).toEqual([
      ["Announcements", ["1"]],
      ["Ideas", ["2", "3"]],
    ]);
  });

  it("filters within sections and collapses when nothing groups", () => {
    const groups = channelSections(
      [channel("1", "welcome", "Announcements"), channel("2", "bugs")],
      "bug",
      true,
    );
    expect(groups).toEqual([
      {
        label: "",
        emoji: "",
        items: [expect.objectContaining({ id: "2", name: "bugs" })],
      },
    ]);
  });

  it("ignores categories for grouped=false", () => {
    const groups = channelSections(
      [channel("1", "welcome", "Announcements"), channel("2", "bugs", "Ideas")],
      "",
      false,
    );
    expect(groups).toEqual([{ label: "", emoji: "", items: [
      expect.objectContaining({ id: "1" }),
      expect.objectContaining({ id: "2" }),
    ] }]);
  });
});
