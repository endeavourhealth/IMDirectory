import z from "zod";
import { TTIriRefSchema } from "@endeavour/vue-library";
import { parseApiResponse } from "@endeavour/vue-library/helpers";
import type { SearchResponse, TTEntity } from "@endeavour/vue-library/models";
import { type PageableNode, PageableNodeSchema, type Query, type TTIriRef } from "@endeavour/vue-library/models";
import { type ECLQueryRequest, type SetDiffObject, SetDiffObjectSchema, type SetExportRequest } from "@/models";
import Env from "./Env";
import api from "./api";

const API_URL = Env.API + "api/set";

const SetService = {
  async publish(conceptIri: string): Promise<void> {
    return await api.get(API_URL + "/private/publish", {
      params: { iri: conceptIri }
    });
  },

  async IMV1(conceptIri: string, raw?: boolean): Promise<Blob> {
    return await api.get(API_URL + "/protected/export", {
      params: { iri: conceptIri },
      responseType: "blob",
      raw: raw
    });
  },
  async getMembers(iri: string, entailments: boolean, pageIndex: number, pageSize: number, controller?: AbortController): Promise<PageableNode> {
    const result = await api.get(API_URL + "/protected/members", {
      params: { iri: iri, entailments: entailments, page: pageIndex, size: pageSize },
      signal: controller?.signal
    });
    return parseApiResponse(result, PageableNodeSchema);
  },

  async getMembersFromIri(iri: string, entailments: boolean, pageIndex: number, pageSize: number, controller?: AbortController): Promise<PageableNode> {
    const result = await api.get(API_URL + "/protected/members", {
      params: { iri: iri, entailments: entailments, page: pageIndex, size: pageSize },
      signal: controller?.signal
    });
    return parseApiResponse(result, PageableNodeSchema);
  },
  async getCurrentMembers(iri: string, includeInactive: Boolean, controller?: AbortController): Promise<SearchResponse> {
    return await api.get(API_URL + "/protected/currentMembers", {
      params: { iri: iri, includeInactive: includeInactive },
      signal: controller?.signal
    });
  },

  async getMembersFromQuery(query: Query, includeInactive: boolean): Promise<SearchResponse> {
    const request = { query: query, includeInactive: includeInactive } as ECLQueryRequest;
    return await api.post(API_URL + "/protected/membersFromQuery", request);
  },

  async getSubsets(iri: string): Promise<TTIriRef[]> {
    const result = await api.get(API_URL + "/protected/subsets", {
      params: {
        iri: iri
      }
    });
    return parseApiResponse(result, z.array(TTIriRefSchema));
  },

  async getFullExportSet(setRequest: SetExportRequest, raw?: boolean): Promise<Blob> {
    return await api.post(API_URL + "/protected/setExport", setRequest, {
      responseType: "blob",
      raw: raw
    });
  },

  async getSetComparison(iriA?: string, iriB?: string): Promise<SetDiffObject> {
    const result = await api.get(API_URL + "/protected/setDiff", {
      params: {
        setIriA: iriA,
        setIriB: iriB
      }
    });
    return parseApiResponse(result, SetDiffObjectSchema);
  },
  async updateSubsetsFromSuper(entity: TTEntity): Promise<void> {
    return await api.post(API_URL + "/private/updateSubsetsFromSuper", entity);
  }
};

if (process.env.NODE_ENV !== "test") Object.freeze(SetService);

export default SetService;
