import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createWorkspaceRepositories,
  waitForPagesDeployment,
} from "../app/lib/creator";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const plan = {
  organization: "acme",
  clientUrl: "https://example.test/",
  ownClient: false,
  nonce: "installation-1",
  administrator: { id: 1, login: "owner" },
};
describe("workspace installer", () => {
  it("refuses the retired public-mailbox installer before contacting GitHub", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await expect(
      createWorkspaceRepositories("installer-token", plan, () => {}),
    ).rejects.toThrow("public authentication mailbox");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("own client deployment", () => {
  it("does not mistake a previous successful deployment for the requested revision", async () => {
    vi.useFakeTimers();
    let checks = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          workflow_runs:
            ++checks === 1
              ? [
                  {
                    head_sha: "old",
                    status: "completed",
                    conclusion: "success",
                  },
                ]
              : [
                  {
                    head_sha: "new",
                    status: "completed",
                    conclusion: "success",
                  },
                ],
        }),
      ),
    );
    const waiting = waitForPagesDeployment("token", "acme/gitrew-client", "new");
    await vi.advanceTimersByTimeAsync(2000);
    await waiting;
    expect(checks).toBe(2);
  });
  it("reports a failed Pages workflow instead of completing installation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          workflow_runs: [
            { head_sha: "new", status: "completed", conclusion: "failure" },
          ],
        }),
      ),
    );
    await expect(
      waitForPagesDeployment("token", "acme/gitrew-client", "new"),
    ).rejects.toThrow("Pages deployment failed");
  });
});
