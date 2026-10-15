export const verifierPattern = /^[A-Za-z0-9._~-]{43,128}$/;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseExchange(value: unknown): {
  code: string;
  verifier: string;
} {
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !["code", "verifier"].includes(key)) ||
    typeof value.code !== "string" ||
    !value.code.length ||
    value.code.length > 512 ||
    typeof value.verifier !== "string" ||
    !verifierPattern.test(value.verifier)
  )
    throw new Error("Invalid exchange");
  return { code: value.code, verifier: value.verifier };
}
