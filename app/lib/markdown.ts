// Minimal GitHub-flavored markdown for anonymous public discussion bodies.
// Escape-first: the source is fully HTML-escaped before any construct is
// turned into markup, so raw HTML in a comment can never execute. Only
// http(s) image and link targets are emitted.

const safeUrlPattern = /^https:\/\/[\w.-]+(:\d+)?(\/[\w#%&+./:=?@~-]*)?$/i;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function href(raw: string): string | null {
  const trimmed = raw.trim();
  return safeUrlPattern.test(trimmed) ? trimmed : null;
}

function inlineHtml(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, (_all, code: string) => `<code>${code}</code>`)
    .replace(
      /!\[([^\]]*)\]\(([^()\s]+)\)/g,
      (all, alt: string, target: string) => {
        const url = href(target);
        return url
          ? `<img src="${url}" alt="${alt}" loading="lazy" referrerpolicy="no-referrer" />`
          : all;
      },
    )
    .replace(/\[([^\]]+)\]\(([^()\s]+)\)/g, (all, label: string, target: string) => {
      const url = href(target);
      return url
        ? `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`
        : all;
    })
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,!?;:)])/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
    .replace(
      /@([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})\b/gi,
      '<a href="https://github.com/$1" target="_blank" rel="noopener noreferrer nofollow">@$1</a>',
    );
}

function renderLines(escaped: string): string {
  const parts: string[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length) {
      parts.push(`<ul>${list.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      list = [];
    }
  };
  for (const line of escaped.split("\n")) {
    if (!line.trim()) {
      flushList();
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      list.push(inlineHtml(line.replace(/^\s*[-*]\s+/, "")));
      continue;
    }
    flushList();
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const [, hashes = "###", text = ""] = heading;
      const level = Math.min(6, Math.max(3, hashes.length + 2));
      parts.push(`<h${level}>${inlineHtml(text)}</h${level}>`);
      continue;
    }
    // escapeHtml already turned source ">" into "&gt;".
    const quote = line.match(/^&gt;\s?(.*)$/);
    if (quote) {
      parts.push(`<blockquote>${inlineHtml(quote[1] ?? "")}</blockquote>`);
      continue;
    }
    parts.push(`<p>${inlineHtml(line)}</p>`);
  }
  flushList();
  return parts.join("");
}

export function renderPublicMarkdown(body: string): string {
  let out = "";
  let lastIndex = 0;
  const fence = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g;
  for (const match of body.matchAll(fence)) {
    const [whole, language = "", code = ""] = match;
    out += renderLines(escapeHtml(body.slice(lastIndex, match.index ?? 0)));
    const codeClass = language.trim()
      ? ` class="language-${language.trim()}"`
      : "";
    out += `<pre><code${codeClass}>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`;
    lastIndex = (match.index ?? 0) + whole.length;
  }
  out += renderLines(escapeHtml(body.slice(lastIndex)));
  return out;
}
