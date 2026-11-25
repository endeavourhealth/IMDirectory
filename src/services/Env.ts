const Env = {
  API: "/imapi/",
  /** Where Casdoor sends the browser after signing in or out. Must be registered as a redirect URL on the Casdoor application. */
  AUTH_REDIRECT_URI: new URL(import.meta.env.BASE_URL, window.location.origin).href
};

Object.freeze(Env);

export default Env;
