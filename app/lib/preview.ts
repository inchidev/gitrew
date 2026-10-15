import type { Channel, Message } from "../../shared/chat";

export const previewChannels: Channel[] = [
  {
    id: "preview-general",
    name: "general",
    description: "The room for everyday things",
  },
  {
    id: "preview-building",
    name: "building",
    description: "Small steps, shared progress",
  },
  {
    id: "preview-little-things",
    name: "little-things",
    description: "The things that make a good day",
  },
];

export function previewMessages(): Message[] {
  const samples: [string, string, string, string, number][] = [
    [
      "preview-welcome",
      "preview-general",
      "",
      "Morning! The launch notes are ready for a final read. I’ve left a couple of questions in #building.",
      -8,
    ],
    [
      "preview-guide",
      "preview-general",
      "",
      "Can we move the team catch-up to 14:30? That gives everyone time to review the notes.",
      -7,
    ],
    [
      "preview-reply-1",
      "preview-general",
      "preview-guide",
      "14:30 works for me. I’ll bring the updated screenshots.",
      -6,
    ],
    [
      "preview-reply-2",
      "preview-general",
      "preview-guide",
      "Same here. Let’s keep it to twenty minutes.",
      -5,
    ],
    [
      "preview-question",
      "preview-general",
      "",
      "Perfect. I’ll post the final checklist here before lunch.",
      -3,
    ],
    [
      "preview-building-1",
      "preview-building",
      "",
      "The new homepage is ready for review. Please add feedback in a thread so we can keep track.",
      -4,
    ],
    [
      "preview-little-1",
      "preview-little-things",
      "",
      "Found a quiet coffee spot near the office. Friday morning, anyone?",
      -2,
    ],
  ];
  return samples.map(([id, channelId, parentId, body, minutes], index) => {
    const time = new Date(Date.now() + minutes * 60_000).toISOString();
    return {
      id,
      channelId,
      parentId,
      body,
      author: index % 2 ? "Denis" : "Mira",
      createdAt: time,
      updatedAt: time,
      status: "local",
      url: "",
    };
  });
}
