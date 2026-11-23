import { beforeEach, describe, expect, it, vi } from "vitest";
import { Env, SetService } from "@/services";
import api from "../../../src/services/api";

describe("SetService.ts ___ axios success", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.get = vi.fn().mockResolvedValue("axios get return");
    api.post = vi.fn().mockResolvedValue("axios post return");
  });

  it("can publish", async () => {
    const result = await SetService.publish("http://endhealth.info/im#testIri");
    expect(api.get).toBeCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(Env.API + "api/set/private/publish", {
      params: { iri: "http://endhealth.info/im#testIri" }
    });
    expect(result).toBe("axios get return");
  });

  it("can get IMV1", async () => {
    const result = await SetService.IMV1("http://endhealth.info/im#testIri");
    expect(api.get).toBeCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(Env.API + "api/set/protected/export", { params: { iri: "http://endhealth.info/im#testIri" }, responseType: "blob" });
    expect(result).toBe("axios get return");
  });

  it("gets current members without inactive concepts by default", async () => {
    await SetService.getCurrentMembers("http://endhealth.info/im#testIri",false);
    expect(api.get).toHaveBeenCalledWith(Env.API + "api/set/protected/currentMembers", {
      params: { iri: "http://endhealth.info/im#testIri", includeInactive: false },
      signal: undefined
    });
  });

  it("gets current members including inactive concepts", async () => {
    const controller = new AbortController();
    const result = await SetService.getCurrentMembers("http://endhealth.info/im#testIri", true, controller);
    expect(api.get).toHaveBeenCalledWith(Env.API + "api/set/protected/currentMembers", {
      params: { iri: "http://endhealth.info/im#testIri", includeInactive: true },
      signal: controller.signal
    });
    expect(result).toBe("axios get return");
  });

  it("gets members from a query with the includeInactive flag", async () => {
    const query = { is: { iri: "http://snomed.info/sct#123" } };
    const request = { query: query, includeInactive: true };
    const result = await SetService.getMembersFromQuery(request);
    expect(api.post).toHaveBeenCalledWith(Env.API + "api/set/protected/membersFromQuery", request, { signal: undefined });
    expect(result).toBe("axios post return");
  });
});
