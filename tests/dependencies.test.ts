import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const sdkEntry = import.meta.resolve("@cloudflare/realtimekit");
const sdkRequire = createRequire(sdkEntry);

describe("scoped dependency compatibility", () => {
  it("preserves RealtimeKit's UUID generation/validation and rejects undersized UUID output buffers", () => {
    const uuid = sdkRequire("uuid");
    expect(uuid.validate(uuid.v4())).toBe(true);
    expect(uuid.validate("2e88f649-d012-4c2e-8fb8-ad4ed31deba9")).toBe(true);
    expect(uuid.validate("invalid-meeting-id")).toBe(false);
    const namespace = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    for (const version of [uuid.v3, uuid.v5])
      expect(() => version("name", namespace, new Uint8Array(8), 4)).toThrow(
        RangeError,
      );
    expect(() => uuid.v6({}, new Uint8Array(8), 4)).toThrow(RangeError);
  });

  for (const format of ["esm", "cjs"]) {
    it(`initializes the real ${format} RealtimeKit SDK far enough to reject an invalid participant token`, async () => {
      const sdk =
        format === "esm"
          ? await import("@cloudflare/realtimekit")
          : sdkRequire("@cloudflare/realtimekit");
      const Client = sdk.default || sdk;
      await expect(
        Client.init({
          authToken: "invalid-participant-token",
          defaults: { audio: false, video: false },
        }),
      ).rejects.toThrow("Invalid auth token");
    });
  }
});

describe("unpatched build dependencies stay outside the shipped runtime", () => {
  for (const [name, entry] of [
    [
      "Worker",
      fileURLToPath(new URL("../backend/cloudflare.ts", import.meta.url)),
    ],
    ["RealtimeKit browser SDK", fileURLToPath(sdkEntry)],
  ]) {
    it(`keeps braces and node-forge out of the ${name} module graph`, async () => {
      const result = await build({
        entryPoints: [entry!],
        bundle: true,
        platform: "browser",
        format: "esm",
        target: "es2022",
        external: ["node:*", "cloudflare:*"],
        write: false,
        metafile: true,
      });
      expect(
        Object.keys(result.metafile.inputs).filter((path) =>
          /node_modules\/(braces|node-forge)\//.test(path),
        ),
      ).toEqual([]);
    });
  }
});
