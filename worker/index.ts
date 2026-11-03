import { executionHandler } from "../lib/execution";
import { settingsHandler, analysisHandler, runnerHandler, discoveryHandler } from "../lib/ai";
import { dashboard } from "../lib/data";
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

const worker = {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    const path = new URL(request.url).pathname;
    if (path === "/api/execution") return executionHandler(request,env as any).catch(()=>Response.json({error:"Technical data unavailable. Refresh later; no order draft has been created."},{status:502,headers:{"Cache-Control":"no-store"}}));
    if (path === "/api/discovery") return discoveryHandler(request,env as any).catch(()=>Response.json({error:"Discovery data unavailable"},{status:502,headers:{"Cache-Control":"no-store"}}));
    if (path === "/api/runner") {
      return runnerHandler(request, env as any).catch(() => Response.json({error:"Runner request failed"},{status:502,headers:{"Cache-Control":"no-store"}}));
    }
    if (path === "/api/settings" || path === "/api/analysis") {
      return (path === "/api/settings" ? settingsHandler : analysisHandler)(request, env as any).catch(() => Response.json({error:"Service unavailable. Check settings and retry."},{status:502,headers:{"Cache-Control":"no-store"}}));
    }
    if (path === "/api/portfolio") {
      if (request.method !== "GET") return new Response("Method not allowed", {status:405});
      return dashboard(env as any).then(data => Response.json(data, {headers:{"Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff"}})).catch((error) => { console.error("Portfolio sync:", error instanceof Error ? error.message : "Unknown upstream error"); return Response.json({error:"Portfolio sync failed. Check NocoDB connectivity and server credentials, then retry."},{status:502,headers:{"Cache-Control":"no-store"}}); });
    }
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};

export default worker;
