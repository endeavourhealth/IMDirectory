import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AuthServiceModule = typeof import("@/services/AuthService");

const manager = {
  getUser: vi.fn(),
  signinSilent: vi.fn(),
  signinRedirect: vi.fn(),
  signinRedirectCallback: vi.fn(),
  signoutRedirect: vi.fn(),
  removeUser: vi.fn()
};
const oidcClient = { createSigninRequest: vi.fn() };
const fetchMock = vi.fn();

// api/config/public/auth answers settings (200), undefined (404, not configured) or HTTP status.
type ConfigAnswer = { url: string; clientId: string } | undefined | number;

function respond(answer: ConfigAnswer) {
  if (typeof answer === "number") return { ok: false, status: answer, json: async () => ({}) };
  if (!answer) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => answer };
}

async function loadAuthService(answer: ConfigAnswer = { url: "https://auth.example.org/", clientId: "client-id" }): Promise<AuthServiceModule> {
  vi.resetModules();
  fetchMock.mockImplementation(async () => respond(answer));
  vi.stubGlobal("fetch", fetchMock);
  vi.doMock("oidc-client-ts", () => ({
    UserManager: vi.fn(function () {
      return manager;
    }),
    OidcClient: vi.fn(function () {
      return oidcClient;
    }),
    WebStorageStateStore: vi.fn(function () {
      return {};
    })
  }));
  return await import("@/services/AuthService");
}

beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getAccessToken", () => {
  it("is undefined when nobody is signed in", async () => {
    const { default: AuthService } = await loadAuthService();
    manager.getUser.mockResolvedValue(null);
    expect(await AuthService.getAccessToken()).toBeUndefined();
  });

  it("returns the token of a signed-in user without renewing it", async () => {
    const { default: AuthService } = await loadAuthService();
    manager.getUser.mockResolvedValue({ expired: false, access_token: "valid" });
    expect(await AuthService.getAccessToken()).toBe("valid");
    expect(manager.signinSilent).not.toHaveBeenCalled();
  });

  it("renews an expired token", async () => {
    const { default: AuthService } = await loadAuthService();
    manager.getUser.mockResolvedValue({ expired: true, access_token: "old" });
    manager.signinSilent.mockResolvedValue({ access_token: "renewed" });
    expect(await AuthService.getAccessToken()).toBe("renewed");
  });

  it("shares one renewal between concurrent callers", async () => {
    const { default: AuthService } = await loadAuthService();
    manager.getUser.mockResolvedValue({ expired: true, access_token: "old" });
    manager.signinSilent.mockResolvedValue({ access_token: "renewed" });
    const tokens = await Promise.all([AuthService.getAccessToken(), AuthService.getAccessToken(), AuthService.getAccessToken()]);
    expect(tokens).toEqual(["renewed", "renewed", "renewed"]);
    expect(manager.signinSilent).toHaveBeenCalledTimes(1);
  });

  it("signs the user out locally when renewal fails", async () => {
    const { default: AuthService } = await loadAuthService();
    manager.getUser.mockResolvedValue({ expired: true, access_token: "old" });
    manager.signinSilent.mockRejectedValue(new Error("refresh token expired"));
    expect(await AuthService.getAccessToken()).toBeUndefined();
    expect(manager.removeUser).toHaveBeenCalled();
  });

  it("is undefined, without touching Casdoor, when sign-in is not configured", async () => {
    const { default: AuthService } = await loadAuthService(404);
    expect(await AuthService.getAccessToken()).toBeUndefined();
    expect(manager.getUser).not.toHaveBeenCalled();
  });
});

describe("login", () => {
  it("remembers where to come back to", async () => {
    const { default: AuthService } = await loadAuthService();
    await AuthService.login("/directory/folder/xyz");
    expect(manager.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: "/directory/folder/xyz" } });
  });

  it("defaults to the page the user is on", async () => {
    const { default: AuthService } = await loadAuthService();
    window.history.replaceState({}, "", "/#/editor/abc");
    await AuthService.login();
    expect(manager.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: "/editor/abc" } });
  });

  it("refuses to start when the client id is not configured", async () => {
    const { default: AuthService } = await loadAuthService(404);
    await expect(AuthService.login()).rejects.toThrow("Sign-in is not configured");
  });
});

describe("toSignupUrl", () => {
  it("swaps the authorize page for the sign-up page and keeps the request", async () => {
    const { toSignupUrl } = await loadAuthService();
    expect(toSignupUrl("https://auth.example.org/login/oauth/authorize?client_id=c&state=s&code_challenge=x")).toBe(
      "https://auth.example.org/signup/oauth/authorize?client_id=c&state=s&code_challenge=x"
    );
  });
});

describe("completeSigninIfRedirected", () => {
  it("does nothing on an ordinary page load", async () => {
    const { default: AuthService } = await loadAuthService();
    window.history.replaceState({}, "", "/#/directory");
    await AuthService.completeSigninIfRedirected();
    expect(manager.signinRedirectCallback).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/directory");
  });

  it("ignores a code that did not come from the sign-in flow (no state)", async () => {
    const { default: AuthService } = await loadAuthService();
    window.history.replaceState({}, "", "/?code=abc#/directory");
    await AuthService.completeSigninIfRedirected();
    expect(manager.signinRedirectCallback).not.toHaveBeenCalled();
  });

  it("finishes the sign-in, drops the code and restores the page the user was on", async () => {
    const { default: AuthService } = await loadAuthService();
    manager.signinRedirectCallback.mockResolvedValue({ state: { returnTo: "/editor/abc" } });
    window.history.replaceState({}, "", "/?code=abc&state=xyz");

    await AuthService.completeSigninIfRedirected();

    expect(window.location.search).toBe("");
    expect(window.location.hash).toBe("#/editor/abc");
    expect(AuthService.consumeSigninError()).toBeUndefined();
  });

  it("records a failure once, so the app can show it instead of looping back to Casdoor", async () => {
    const { default: AuthService } = await loadAuthService();
    manager.signinRedirectCallback.mockRejectedValue(new Error("No matching state found in storage"));
    window.history.replaceState({}, "", "/?error=access_denied&state=xyz#/directory");

    await AuthService.completeSigninIfRedirected();

    expect(window.location.search).toBe("");
    expect(AuthService.consumeSigninError()).toBe("No matching state found in storage");
    expect(AuthService.consumeSigninError()).toBeUndefined();
  });
});

describe("logout", () => {
  it("signs out of Casdoor", async () => {
    const { default: AuthService } = await loadAuthService();
    await AuthService.logout();
    expect(manager.signoutRedirect).toHaveBeenCalled();
  });

  it("falls back to clearing the local session when Casdoor offers no end-session endpoint", async () => {
    const { default: AuthService } = await loadAuthService();
    manager.signoutRedirect.mockRejectedValue(new Error("No end session endpoint"));
    await AuthService.logout();
    expect(manager.removeUser).toHaveBeenCalled();
  });
});

describe("profileUrl", () => {
  it("points at the Casdoor account page", async () => {
    const { default: AuthService } = await loadAuthService();
    expect(await AuthService.profileUrl()).toBe("https://auth.example.org/account");
  });
});

describe("sign-in settings from IMAPI", () => {
  it("are fetched once, for this app, and passed to oidc-client-ts", async () => {
    const { default: AuthService, AUTH_CONFIG_URL } = await loadAuthService();
    const { UserManager } = await import("oidc-client-ts");
    manager.getUser.mockResolvedValue(null);

    await AuthService.getAccessToken();
    await AuthService.getIsCurrentUser();
    await AuthService.login("/");

    expect(AUTH_CONFIG_URL).toBe("/imapi/api/config/public/auth?app=IMDirectory");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(AUTH_CONFIG_URL, expect.anything());
    expect(UserManager).toHaveBeenCalledTimes(1);
    expect(UserManager).toHaveBeenCalledWith(expect.objectContaining({ authority: "https://auth.example.org", client_id: "client-id" }));
  });

  it("treat IMAPI being unreachable as signed out, try again next time", async () => {
    const { default: AuthService } = await loadAuthService(503);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await AuthService.getAccessToken()).toBeUndefined();
    expect(await AuthService.getIsCurrentUser()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(AuthService.login()).rejects.toThrow("HTTP 503");
  });

  it("are refused when incomplete", async () => {
    const { default: AuthService } = await loadAuthService({ url: "https://auth.example.org", clientId: "" });
    await expect(AuthService.login()).rejects.toThrow("incomplete");
  });

  it("let a sign-up start on Casdoor's sign-up page", async () => {
    const { default: AuthService } = await loadAuthService();
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, hash: "", assign });
    oidcClient.createSigninRequest.mockResolvedValue({ url: "https://auth.example.org/login/oauth/authorize?client_id=client-id" });
    await AuthService.register("/");
    expect(assign).toHaveBeenCalledWith("https://auth.example.org/signup/oauth/authorize?client_id=client-id");
  });
});
