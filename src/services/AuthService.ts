import { OidcClient, type User, UserManager, type UserManagerSettings, WebStorageStateStore } from "oidc-client-ts";
import Env from "./Env";

/** Carried through the round trip to Casdoor so the user lands back on the page they were on. */
interface SigninState {
  returnTo?: string;
}

export interface AuthConfig {
  url: string;
  clientId: string;
}

const APP_NAME = "IMDirectory";
export const AUTH_CONFIG_URL = Env.API + "api/config/public/auth?app=" + APP_NAME;

const SIGNIN_ERROR_KEY = "auth.signinError";
const LOGIN_PATH = "/login/oauth/authorize";
const SIGNUP_PATH = "/signup/oauth/authorize";

async function fetchConfig(): Promise<AuthConfig | undefined> {
  const response = await fetch(AUTH_CONFIG_URL, { headers: { Accept: "application/json" } });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`HTTP ${response.status}: Could not load the sign-in settings`);
  const body = await response.json();
  if (typeof body?.url !== "string" || !body.url || typeof body?.clientId !== "string" || !body.clientId)
    throw new Error("Returned incomplete sign-in settings");
  return { url: body.url.replace(/\/+$/, ""), clientId: body.clientId };
}

let config: Promise<AuthConfig | undefined> | undefined;
let manager: Promise<UserManager | undefined> | undefined;
let refreshing: Promise<User | null> | undefined;

function getConfig(): Promise<AuthConfig | undefined> {
  return (config ??= fetchConfig().catch(e => {
    config = undefined;
    manager = undefined;
    throw e;
  }));
}

function createSettings(authConfig: AuthConfig): UserManagerSettings {
  return {
    authority: authConfig.url,
    client_id: authConfig.clientId,
    redirect_uri: Env.AUTH_REDIRECT_URI,
    post_logout_redirect_uri: Env.AUTH_REDIRECT_URI,
    response_type: "code",
    scope: "openid profile email",
    automaticSilentRenew: true,
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    stateStore: new WebStorageStateStore({ store: window.sessionStorage })
  };
}

async function requireConfig(): Promise<AuthConfig> {
  const authConfig = await getConfig();
  if (!authConfig) throw new Error("Sign-in is not configured: IMAPI has no Casdoor client id for " + APP_NAME);
  return authConfig;
}

function getManager(): Promise<UserManager | undefined> {
  return (manager ??= getConfig().then(authConfig => (authConfig ? new UserManager(createSettings(authConfig)) : undefined)));
}

async function requireManager(): Promise<UserManager> {
  await requireConfig();
  return (await getManager())!;
}

// `getManager` but treating IMAPI being unreachable as "not signed in" rather than failing
async function getManagerOrUndefined(): Promise<UserManager | undefined> {
  try {
    return await getManager();
  } catch (e) {
    console.error(e);
    return undefined;
  }
}

function currentRoute(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

/** The sign-up variant of an authorize URL: same request, different Casdoor page. */
export function toSignupUrl(authorizeUrl: string): string {
  return authorizeUrl.replace(LOGIN_PATH, SIGNUP_PATH);
}

const AuthService = {
  /** Sends the browser to Casdoor to sign in, returning to `returnTo` (a router path) afterwards. */
  async login(returnTo: string = currentRoute()): Promise<void> {
    await (await requireManager()).signinRedirect({ state: { returnTo } satisfies SigninState });
  },

  /** As `login`, but starting on Casdoor's sign-up page. */
  async register(returnTo: string = currentRoute()): Promise<void> {
    const request = await new OidcClient(createSettings(await requireConfig())).createSigninRequest({ state: { returnTo } satisfies SigninState });
    window.location.assign(toSignupUrl(request.url));
  },

  /** Signs out of this app and of Casdoor. Falls back to a reload if Casdoor offers no end-session endpoint. */
  async logout(): Promise<void> {
    const userManager = await getManagerOrUndefined();
    if (!userManager) {
      window.location.reload();
      return;
    }
    try {
      await userManager.signoutRedirect();
    } catch (e) {
      console.warn("Could not sign out of Casdoor, clearing the local session only", e);
      await userManager.removeUser();
      window.location.reload();
    }
  },

  async clearSession() {
    await (await getManagerOrUndefined())?.removeUser();
  },

  async profileUrl(): Promise<string> {
    return (await requireConfig()).url + "/account";
  },

  /** A valid access token for the signed-in user, renewed first if it has expired. Undefined if nobody is signed in. */
  async getAccessToken(): Promise<string | undefined> {
    const userManager = await getManagerOrUndefined();
    if (!userManager) return undefined; // sign-in is not configured (e.g. a public deployment) or IMAPI is unreachable
    const user = await userManager.getUser();
    if (!user) return undefined;
    if (!user.expired) return user.access_token;

    // Concurrent requests share one renewal (a refresh token may be single use)
    refreshing ??= userManager.signinSilent().finally(() => (refreshing = undefined));
    try {
      return (await refreshing)?.access_token;
    } catch {
      await userManager.removeUser();
      return undefined;
    }
  },

  async getIsCurrentUser(): Promise<boolean> {
    const userManager = await getManagerOrUndefined();
    if (!userManager) return false; // sign-in is not configured (e.g. a public deployment) or IMAPI is unreachable
    const user = await userManager.getUser();
    if (!user) return false;
    else return !user.expired;
  },

  /**
   * If the browser has just come back from Casdoor, completes the sign-in and tidies the address bar (dropping the code and restoring the
   * page the user was on). Must run before the router starts. Failures are recorded rather than thrown, see `consumeSigninError`.
   */
  async completeSigninIfRedirected(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("state") || !(params.has("code") || params.has("error"))) return;

    let returnTo: string | undefined;
    try {
      const user = await (await requireManager()).signinRedirectCallback();
      returnTo = (user.state as SigninState | undefined)?.returnTo;
    } catch (e) {
      console.error("Sign-in failed", e);
      window.sessionStorage.setItem(SIGNIN_ERROR_KEY, e instanceof Error ? e.message : "Sign-in failed");
    }
    const hash = returnTo ? `#${returnTo}` : window.location.hash;
    window.history.replaceState(window.history.state, "", window.location.pathname + hash);
  },

  /** The reason the last sign-in attempt failed, once. Lets the app show it instead of redirecting to Casdoor in a loop. */
  consumeSigninError(): string | undefined {
    const error = window.sessionStorage.getItem(SIGNIN_ERROR_KEY) ?? undefined;
    window.sessionStorage.removeItem(SIGNIN_ERROR_KEY);
    return error;
  }
};

export default AuthService;
