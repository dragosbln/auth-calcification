// Calcified: tests that mock the vendor and assert against the vendor's
// shape. They pass today and die on migration — exactly the anti-pattern
// the boundary's contract suite is meant to replace.
// Trips boundary B3 (no contract suite; vendor-mocked tests).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAuthSession } from "aws-amplify/auth";

vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: vi.fn(),
}));

describe("auth (vendor-shape mocking — calcified)", () => {
  beforeEach(() => {
    vi.mocked(fetchAuthSession).mockResolvedValue({
      // Asserting against the vendor's AuthSession shape directly.
      tokens: {
        idToken: {
          toString: () => "id.jwt.token",
          payload: { "cognito:groups": ["admin"], "cognito:username": "u1" },
        },
      },
    } as unknown as Awaited<ReturnType<typeof fetchAuthSession>>);
  });

  it("returns a session with cognito:groups in the id token payload", async () => {
    const session = await fetchAuthSession();
    expect(session.tokens?.idToken?.payload["cognito:groups"]).toContain(
      "admin",
    );
  });
});
