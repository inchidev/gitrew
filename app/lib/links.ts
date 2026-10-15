export function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "github.com" &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : "";
  } catch {
    return "";
  }
}
