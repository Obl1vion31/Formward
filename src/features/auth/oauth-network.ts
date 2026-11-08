import { AsyncLocalStorage } from "node:async_hooks";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
export type OAuthMaterial = { url: string; body: string; contentType: string };
type NetworkState = { materials: Map<string,OAuthMaterial> };
const shared = globalThis as typeof globalThis & { formwardOAuthNetwork?: AsyncLocalStorage<NetworkState> };
const context = shared.formwardOAuthNetwork ??= new AsyncLocalStorage<NetworkState>();
function materialResponse(input: RequestInfo | URL, init?: RequestInit) {
  const state = context.getStore(); if (!state) return null;
  const request = new Request(input,init), material = state.materials.get(request.url);
  if (!["GET","HEAD"].includes(request.method) || !material) throw new Error("OAuth外部资料未通过预检。");
  return new Response(request.method === "HEAD" ? null : material.body,{headers:{"Content-Type":material.contentType,"Cache-Control":"no-store"}});
}
export const oauthMetadataFetch: typeof fetchClientMetadataResource = async (input,init) => materialResponse(input,init) ?? fetchClientMetadataResource(input,init);
export async function withOAuthMaterials<T>(materials: OAuthMaterial[], work:()=>Promise<T>) {
  // Next.js 可能在 instrumentation 后安装 fetch；每次只包裹当前实现，并保持同一个请求上下文。
  const current = globalThis.fetch as typeof fetch & { formwardOAuth?: boolean };
  if (!current.formwardOAuth) {
    const wrapped: typeof current = async (input,init)=>materialResponse(input,init) ?? current(input,init);
    wrapped.formwardOAuth = true; globalThis.fetch = wrapped;
  }
  return context.run({materials:new Map(materials.map(m=>[m.url,m]))},work);
}
