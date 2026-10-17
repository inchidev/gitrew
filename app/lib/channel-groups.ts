// Slack-style channel sections: GitHub discussion categories become side
// sections that keep the order the server returned. Search filters within
// every section; an empty or non-guest list renders one plain section.
import type { Channel } from "../../shared/chat";

// GitHub categories ship emoji shortcodes (`:grey_question:`), not glyphs.
// Map the common ones; an unknown or plain-unicode value degrades cleanly.
const emojiByCode: Record<string, string> = {
  grey_question: "❓",
  question: "❓",
  grey_exclamation: "❗",
  exclamation: "❗",
  white_check_mark: "✅",
  sparkles: "✨",
  bulb: "💡",
  light_bulb: "💡",
  tada: "🎉",
  eyes: "👀",
  heart: "❤️",
  fire: "🔥",
  rocket: "🚀",
  ship: "🚀",
  thinking: "🤔",
  pray: "🙏",
  raised_hands: "🙌",
  grinning: "😄",
  smiley: "🙂",
  bug: "🐛",
  package: "📦",
  rotating_light: "🚨",
  camera_flash: "📸",
  bell: "🔔",
  book: "📖",
  warning: "⚠️",
  zap: "⚡",
  construction: "🚧",
  phone: "📱",
  computer: "💻",
  speech_balloon: "💬",
  memo: "📝",
  star: "⭐",
  hugging_face: "🤗",
};
export function emojiGlyph(emoji?: string | null): string {
  if (!emoji) return "";
  if (!emoji.startsWith(":")) return emoji;
  const code = emoji.slice(1, -1).toLowerCase();
  return emojiByCode[code] || "";
}

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
    const emoji = grouped ? emojiGlyph(channel.category?.emoji) : "";
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
