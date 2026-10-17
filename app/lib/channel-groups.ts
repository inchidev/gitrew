// Slack-style channel sections: GitHub discussion categories become side
// sections that keep the order the server returned. Search filters within
// every section; an empty or non-guest list renders one plain section.
import type { Channel } from "../../shared/chat";

export interface ChannelSection {
  label: string;
  emoji: string;
  items: Channel[];
}

export function channelSections(
  channels: Channel[],
  query: string,
  grouped: boolean,
): ChannelSection[] {
  const needle = query.trim().toLowerCase();
  const parts: ChannelSection[] = [];
  const index = new Map<string, ChannelSection>();
  for (const channel of channels) {
    if (needle && !`${channel.name} ${channel.description || ""}`.toLowerCase().includes(needle))
      continue;
    const label = grouped && channel.category?.name ? channel.category.name : "";
    const emoji = grouped && channel.category?.emoji ? channel.category.emoji : "";
    const key = `${label}\u0000${emoji}`;
    let section = index.get(key);
    if (!section) {
      section = { label, emoji, items: [] };
      index.set(key, section);
      parts.push(section);
    }
    section.items.push(channel);
  }
  if (parts.length === 1) parts[0]!.label = "";
  return parts;
}
