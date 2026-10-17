import { describe, expect, it } from "vitest";
import { renderPublicMarkdown } from "../app/lib/markdown";

describe("renderPublicMarkdown", () => {
  it("escapes raw HTML before rendering", () => {
    const html = renderPublicMarkdown("<script>alert(1)</script>");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("renders fenced code blocks with a language class", () => {
    const html = renderPublicMarkdown("```ts\nconst app = <create>();\n```");
    expect(html).toContain(
      '<pre><code class="language-ts">const app = &lt;create&gt;();</code></pre>',
    );
  });

  it("renders headings, lists, quotes and inline styles", () => {
    const html = renderPublicMarkdown(
      "## Plan\n- first **bold**\n- second `code`\n> quoted *hint* ~~gone~~",
    );
    expect(html).toContain("<h4>Plan</h4>");
    expect(html).toContain("<ul><li>first <strong>bold</strong></li><li>second <code>code</code></li></ul>");
    expect(html).toContain("<blockquote>quoted <em>hint</em> <del>gone</del></blockquote>");
  });

  it("links https targets and @mentions, rejects other schemes", () => {
    const html = renderPublicMarkdown(
      "![kitten](https://example.com/k.png) [docs](https://nuxt.com) [evil](javascript:alert(1)) hi @team-dogs!",
    );
    expect(html).toContain('<img src="https://example.com/k.png"');
    expect(html).toContain(
      '<a href="https://nuxt.com" target="_blank" rel="noopener noreferrer nofollow">docs</a>',
    );
    expect(html).not.toContain('href="javascript:alert(1)"');
    expect(html).toContain('href="https://github.com/team-dogs"');
  });
});
