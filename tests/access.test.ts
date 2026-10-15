import { describe, it, expect } from "vitest";
import { deploymentApp } from "../backend/access";
const app = {
  id: 1,
  slug: "gitrew",
  client_id: "client",
  client_secret: "secret",
  pem: "pem",
  webhook_secret: "hook",
  owner: { login: "crew" },
  origin: "https://old.example.com",
};
describe("deployment origin", () => {
  it("changes only the effective origin and team, preserving stored credentials", () => {
    const changed = deploymentApp(app, {
      APP_ORIGIN: "https://new.example.com",
      ALLOWED_TEAM: "afterprompt",
    });
    expect(changed).toEqual({
      ...app,
      origin: "https://new.example.com",
      allowedTeam: "afterprompt",
    });
    expect(app.origin).toBe("https://old.example.com");
    expect(deploymentApp(app, {})).toEqual(app);
  });
  it("rejects unsafe origins and invalid team slugs", () => {
    for (const origin of [
      "http://new.example.com",
      "https://user:secret@new.example.com",
      "https://new.example.com/path",
      "https://new.example.com?token=secret",
    ]) {
      expect(() => deploymentApp(app, { APP_ORIGIN: origin })).toThrow();
    }
    expect(() => deploymentApp(app, { ALLOWED_TEAM: "../other" })).toThrow();
  });
});
