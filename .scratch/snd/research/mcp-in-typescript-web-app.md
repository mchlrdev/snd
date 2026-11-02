# MCP in a TypeScript web app (HTTP transport, 2026)

Research for wayfinder ticket `06-mcp-in-typescript-web-app`. Primary sources only: MCP spec (`modelcontextprotocol.io`), official TypeScript SDK repo and package docs. No product code. No tool-list design.

Checked: 2026-11-02. Spec revision treated as current: **2026-07-28** (`https://modelcontextprotocol.io/specification/latest` describes the stateless, per-request protocol; the dated revision is `https://modelcontextprotocol.io/specification/2026-07-28`). SDK treated as current: **v2** `@modelcontextprotocol/server@2.4.0` (npm, published 2026-10-23), implementing that revision.

---

## 1. Official HTTP transport name, and what is deprecated

The 2026-07-28 spec defines **two** standard transports:

1. **stdio** — newline-delimited JSON-RPC on stdin/stdout of a client-launched subprocess.
2. **Streamable HTTP** — each JSON-RPC message is an HTTP **POST** to a single MCP endpoint; the reply is either one JSON object or a **request-scoped** SSE stream.

Source: [Transports overview (2026-07-28)](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports).

**Streamable HTTP** is the HTTP transport. It was introduced in protocol version `2025-03-26` as the replacement for **HTTP+SSE** from `2024-11-05`. Source: [Streamable HTTP (2026-07-28)](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).

**Deprecated (do not adopt for a greenfield HTTP server):**

| Feature | Status | Source |
|---|---|---|
| **HTTP+SSE** (separate `GET /sse` stream + `POST /messages`) | Deprecated since `2025-03-26`; classified Deprecated under SEP-2596. New implementations SHOULD NOT adopt it. Eligible for removal after the SEP-2596 grace window. | [Deprecated features registry](https://modelcontextprotocol.io/specification/2026-07-28/deprecated); [Streamable HTTP → HTTP+SSE section](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) |
| Protocol-level **sessions** (`Mcp-Session-Id`), standalone **HTTP GET** SSE, **DELETE** session teardown, SSE **resumability** (`Last-Event-ID`) | Removed from Streamable HTTP in `2026-07-28` (they still exist in `2025-03-26`–`2025-11-25`). A 2026-only server SHOULD answer GET/DELETE with `405 Method Not Allowed` and ignore `Mcp-Session-Id` / `Last-Event-ID`. | [2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog); [Streamable HTTP → Backward Compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) |
| `initialize` / `notifications/initialized` handshake | Removed in `2026-07-28`. Every request carries version + capabilities in `_meta`. Optional `server/discover` for advertisement. | [changelog items 2–3](https://modelcontextprotocol.io/specification/2026-07-28/changelog) |

**stdio is not deprecated.** It remains a standard transport. It is the wrong shape for a remote web app: the client must launch the server as a child process. Source: [stdio binding](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports).

**SSE as a response encoding is not the old HTTP+SSE transport.** Streamable HTTP still uses `Content-Type: text/event-stream` for request-scoped replies and for `subscriptions/listen`. That is not the deprecated two-endpoint HTTP+SSE transport.

SDK alignment:

- v2 (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`) is the **stable release line** and implements **2026-07-28**. Source: [typescript-sdk README](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md); [npm `@modelcontextprotocol/server`](https://www.npmjs.com/package/@modelcontextprotocol/server).
- v1 (`@modelcontextprotocol/sdk`) lives on the `v1.x` branch and receives bug/security fixes for at least six months after the v2 release (2026-07-27). Source: same README.
- The v2 server **never serves HTTP+SSE**. Frozen v1 copy: `@modelcontextprotocol/server-legacy/sse` (deprecated, planned removal in v3). Source: [Support legacy clients](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/legacy-clients.md); API note on [`SSEServerTransport`](https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server-legacy/sse/sse.html).

---

## 2. How the official TS SDK mounts Streamable HTTP on an existing HTTP server

v2 serving entry is **`createMcpHandler(factory)`** from `@modelcontextprotocol/server`. It returns `{ fetch, close, notify, bus }`. `fetch` is a web-standard `(Request) => Promise<Response>`. The factory builds a **fresh `McpServer` per HTTP request**. The handler holds no session state. Source: [Serve over HTTP](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/http.md); API: [`createMcpHandler`](https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/server/server/createMcpHandler.html).

This **replaces** the v1 per-request `StreamableHTTPServerTransport` + `connect()` wiring. Source: same HTTP guide (“Coming from v1?”); [upgrade guide](https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2).

The handler **does not listen**. The host app chooses the path and the runtime.

### Fetch-compatible runtimes (Workers / Deno / Bun)

`export default handler` is the whole mount. On a bare fetch runtime the handler answers MCP on **every path** unless the host routes first. Source: [Serve on web-standard runtimes](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/web-standard.md).

### Node `http`

Wrap once with `toNodeHandler` from `@modelcontextprotocol/node`. Put Host/Origin guards in front (the handler itself validates neither):

Documented pattern (`docs/serving/http.md`):

```ts
const nodeHandler = toNodeHandler(handler);
const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();
createServer((req, res) => {
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    void nodeHandler(req, res);
}).listen(3000, '127.0.0.1');
```

`toNodeHandler` converts Node `IncomingMessage`/`ServerResponse` to web `Request`/`Response` and writes SSE with backpressure. Source: [`toNodeHandler` API](https://ts.sdk.modelcontextprotocol.io/v2/api/@modelcontextprotocol/node/toNodeHandler.html).

Lower-level alternative still in the Node package: `NodeStreamableHTTPServerTransport` wrapping `WebStandardStreamableHTTPServerTransport` (used for **hand-wired 2025 sessionful** servers, not the v2 default). Source: [streamableHttp API](https://ts.sdk.modelcontextprotocol.io/v2/api/@modelcontextprotocol/node/streamableHttp.html); [Sessions, state, and scaling](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/sessions-state-scaling.md).

### Express

Packages: `@modelcontextprotocol/server`, `@modelcontextprotocol/express`, `@modelcontextprotocol/node`, `express`.

`createMcpExpressApp()` is `express()` plus `express.json()` and DNS-rebinding Host/Origin middleware. Mount the handler on **one route**:

```ts
const app = createMcpExpressApp();
const node = toNodeHandler(handler);
app.all('/mcp', (req, res) => void node(req, res, req.body));
```

Pass `req.body` as the third argument so the adapter does not re-read a stream Express already consumed. Source: [Serve with Express](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/express.md); implementation: [`packages/middleware/express/src/express.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/express/src/express.ts).

The docs call this “an ordinary Express app with one route.” Other routes can be added on the same `app`.

### Hono

Packages: `@modelcontextprotocol/server`, `@modelcontextprotocol/hono`, `hono`. **No** `toNodeHandler`. Call `handler.fetch` with the raw Request:

```ts
const app = createMcpHonoApp();
app.all('/mcp', (c: Context) => handler.fetch(c.req.raw, { parsedBody: c.get('parsedBody') }));
```

On Node, pass `app` to `serve` from `@hono/node-server`. Source: [Serve with Hono](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/hono.md).

### Fastify

Same shape as Express: `@modelcontextprotocol/fastify` helpers (`createMcpFastifyApp`) + Host header validation. Listed in [README middleware packages](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md).

### What sits in front of the handler (SDK, not optional on localhost)

The handler “validates no `Host` header, no `Origin` header, and no token.” Those checks mount **in front**. Framework factories arm Host/Origin by default on localhost binds. Source: [Serve over HTTP](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/http.md).

`createMcpExpressApp` / `createMcpHonoApp` apply Host and Origin middleware with **`app.use(...)` — globally, not scoped to `/mcp`**. Source: [`packages/middleware/express/src/express.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/express/src/express.ts) (same ladder in the Hono package). That matters if the same app also serves a public browser POST (see §5).

---

## 3. Typical URL path, session/init handshake, CORS vs Origin

### Path

The spec requires **one** HTTP endpoint (the “MCP endpoint”). Example given: `https://example.com/mcp`. The path is **not** a protocol constant; `/mcp` is the example used by the spec and every official SDK recipe. Source: [Streamable HTTP](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http); Express/Hono/web-standard guides all mount `app.all('/mcp', …)` or POST to `/mcp`.

2026-07-28: that endpoint **supports POST**. GET and DELETE are not part of this revision; a 2026-only server SHOULD return **`405 Method Not Allowed`**. Source: [Earlier Streamable HTTP Revisions](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).

Clients MUST send `Accept: application/json, text/event-stream`. The server MAY answer `application/json` or `text/event-stream`. Source: same page, “Sending Messages”.

For SSE responses the spec encourages `X-Accel-Buffering: no` so reverse proxies do not buffer the stream. Source: same page, “Receiving Messages”.

### Handshake and session (two eras on the same URL)

**2026-07-28 (“modern” era)** — no protocol session, no `initialize`:

- Every POST carries `MCP-Protocol-Version` (must match `_meta.io.modelcontextprotocol/protocolVersion`), `Mcp-Method` (all requests), and `Mcp-Name` when the method is `tools/call` / `resources/read` / `prompts/get`. Source: [Request Metadata](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).
- Body `_meta` carries `protocolVersion`, `clientCapabilities`, and SHOULD `clientInfo`. Source: [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog); [schema `RequestMetaObject`](https://modelcontextprotocol.io/specification/2026-07-28/schema).
- Servers MUST implement `server/discover`. Clients MAY call it first; they MAY also just send an RPC and handle `UnsupportedProtocolVersionError` (`-32022`). Source: [Versioning](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning).
- Long-lived server→client notifications: POST `subscriptions/listen`, not HTTP GET.

**2025-03-26 through 2025-11-25 (“legacy” era)** — Streamable HTTP in a different shape:

- POST `initialize` → `InitializeResult` MAY include `MCP-Session-Id` / `Mcp-Session-Id`.
- Client MUST replay that header on later requests; DELETE terminates; GET opens a standalone SSE stream. Source: [Transports (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports).

SDK default: `createMcpHandler` serves **both eras from one factory**. Default HTTP posture is `legacy: 'stateless'` — 2025 `initialize` works, but **no session is kept**, so legacy GET/DELETE still get `405`. Pass `legacy: 'reject'` for 2026-only. Sessionful 2025 needs a hand-wired `NodeStreamableHTTPServerTransport` routed with `isLegacyRequest`. Source: [Support legacy clients](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/legacy-clients.md); [Protocol versions](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/protocol-versions.md).

The SDK client default is still the 2025 `initialize` handshake (`versionNegotiation` absent or `mode: 'legacy'`). `mode: 'auto'` probes `server/discover` first. Source: [Protocol versions](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/protocol-versions.md). Desktop hosts that have not moved to 2026 will therefore still send `initialize` unless they negotiate otherwise.

### CORS vs Origin (these are different)

The spec **does not define CORS** (`Access-Control-Allow-Origin` etc.) on the MCP endpoint.

What it **does** require: if an `Origin` header is **present and invalid**, respond **`403 Forbidden`** (DNS rebinding). Local servers SHOULD bind `127.0.0.1`, not `0.0.0.0`. Servers SHOULD authenticate. Source: [Streamable HTTP → Security & Endpoint](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).

SDK Origin check:

- Missing/empty `Origin` **passes**. “Non-browser MCP clients do not send one.”
- Present Origin is matched against a **hostname allowlist** (port-agnostic). Unparseable values including opaque `"null"` are denied.
- Browser extensions send their extension ID as Origin hostname; `http://*` / `https://*` are **not** honoured.

Source: [`packages/server/src/server/middleware/originValidation.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/src/server/middleware/originValidation.ts); Express wrapper [`packages/middleware/express/src/middleware/originValidation.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/express/src/middleware/originValidation.ts).

**Cursor / other desktop MCP hosts** are non-browser HTTP clients. The SDK’s stated model is: they omit `Origin`, so Origin validation does not block them. The spec and SDK do not publish a Cursor-specific CORS matrix.

**Browser** callers (operator UI on another origin, browser-extension MCP client) **do** send `Origin`. They also need CORS **response** headers if the browser is to expose the response to JS. The MCP handler does **not** add those. The SDK **does** send permissive CORS (`Access-Control-Allow-Origin: *`, OPTIONS 204, reflected `Access-Control-Allow-Headers`) on **OAuth metadata** well-known routes only — so a web MCP client can fetch discovery documents. Source: [`packages/server/src/server/middleware/oauthMetadata.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/src/server/middleware/oauthMetadata.ts); [authorization.md](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/authorization.md) (“permissive CORS”). Custom MCP headers (`Authorization`, `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name`) are not simple CORS headers; a browser client would preflight. The SDK client documents that an opaque CORS `TypeError` during the `server/discover` probe falls back to the legacy era. Source: [Protocol versions → Understand the probe](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/protocol-versions.md).

Same-origin Operator UI (UI and `/mcp` on one origin) does not need CORS. Cross-origin browser JS talking to `/mcp` needs extra CORS headers the SDK does not install on that route.

Binding to `0.0.0.0` **drops** the default Host/Origin guards unless `allowedHosts` / `allowedOrigins` are set. Source: Express/Hono serving guides; `createMcpExpressApp` source.

---

## 4. Where authentication belongs

**HTTP layer, not the JSON-RPC body.** The Authorization spec’s purpose statement: “authorization capabilities **at the transport level**.” Source: [Authorization (2026-07-28)](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).

Rules from that spec:

- Authorization is **OPTIONAL**. When used on HTTP, implementations **SHOULD** conform to this spec. stdio implementations **SHOULD NOT** follow it (credentials from the environment instead).
- Token on **every** HTTP request: `Authorization: Bearer <access-token>` (OAuth 2.1 §5.1.1). **MUST NOT** put tokens in the query string.
- MCP server = OAuth 2.1 **resource server**. It verifies tokens; it does not issue them. Invalid/expired → HTTP **401**. Audience (RFC 8707) MUST be this server.
- MCP servers that implement authorization MUST publish OAuth 2.0 Protected Resource Metadata (RFC 9728). `401` SHOULD carry `WWW-Authenticate: Bearer resource_metadata="…", scope="…"`.
- Tokens MUST NOT be passed through to upstream APIs. Source: [Authorization Security Considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations).

The Streamable HTTP security list separately: “Servers SHOULD implement proper authentication for **all connections**.” That is still HTTP-connection auth, not an MCP JSON-RPC method. Source: [Streamable HTTP → Security & Endpoint](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http).

**Session IDs are not credentials.** 2026 has no protocol sessions. Security best practices: servers MUST NOT treat possession of a state handle as authentication; bind handles to the verified token identity. For 2025 session IDs, see the 2025-11-25 “Session Hijacking” page. Source: [Security Best Practices (2026-07-28)](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices).

SDK:

- `createMcpHandler` **never** reads `Authorization` and **never** verifies a token. Verify in front; pass the result as `handler.fetch(request, { authInfo })`. Express: `requireBearerAuth` then `toNodeHandler` forwards `req.auth` → `ctx.http.authInfo`. Source: [Serve over HTTP](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/http.md); [Require authorization](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/authorization.md); Express recipe.
- `requireBearerAuth` is an OAuth resource-server gate: missing/bad token → `401 invalid_token`; missing scopes → `403 insufficient_scope`; both with `WWW-Authenticate`. The `verifier` you supply is “take the raw token string, return `AuthInfo`” (JWT, introspection, or a lookup). The SDK **never issues tokens**. v1 Authorization-Server helpers are frozen in `@modelcontextprotocol/server-legacy/auth`; the v2 guide says use a dedicated IdP for new servers.
- Per-operation `scopeChallenge` / `requireScopes` can 403 a **call** while the primitive **stays visible in list operations**. Source: same authorization guide.

A static operator Bearer token therefore belongs in the **`Authorization` header**, checked by middleware in front of `/mcp`. That matches the transport-level rule. It is **not** an MCP protocol field. If the server claims the full MCP Authorization profile, the spec also wants RFC 9728 metadata and an authorization server; a verifier-only Bearer gate is what the SDK documents as the resource-server half, with the IdP out of process.

A `401`/`403` on the `server/discover` probe is treated as auth failure, **not** as “this is a 2025 server.” Source: [Protocol versions](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/protocol-versions.md).

---

## 5. One process: public unauthenticated POST + authenticated MCP

**Yes. The SDK’s documented mount is “one route on an ordinary app.”** Express: `app.all('/mcp', auth, (req, res) => void node(req, res, req.body))`. Other Express/Hono routes are unconstrained by the MCP handler. Source: [Serve with Express](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/express.md); [Require authorization](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/authorization.md) (auth middleware only on `/mcp`).

Authorization is optional per implementation; nothing in the spec requires every HTTP path on the process to be an MCP resource. The MCP auth profile applies to **MCP HTTP requests**.

Constraints that **do** come from spec/SDK if both live on one listener:

1. **Do not put Bearer auth on the public form route.** Keep `requireBearerAuth` (or equivalent) on `/mcp` only, as the Express recipe does.
2. **`createMcpExpressApp` / `createMcpHonoApp` install Host + Origin middleware with `app.use` (all routes).** A browser form POST **does** send `Origin`. If that Origin’s hostname is not on `allowedOrigins`, the SDK middleware returns **403 JSON-RPC** before your form handler runs. Implementation: [`express.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/express/src/express.ts); Origin 403 body: [`originValidation.ts`](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/express/src/middleware/originValidation.ts). Practical options the sources support: use a plain `express()`/`Hono()` and attach Host/Origin **only** on `/mcp`; or pass `allowedOrigins` that include the public form origins (and still authenticate `/mcp`). The spec’s Origin MUST applies to Streamable HTTP connections, not to every unrelated route.
3. **`express.json()` is also global** on `createMcpExpressApp` (default limit `100kb`). Form POST is typically `application/x-www-form-urlencoded` or `multipart/form-data`; `express.json()` leaves those bodies alone. Still a reason not to treat the MCP app factory as the whole site stack without reading its middleware list.
4. **Bind and Host allowlist** apply to the process. A public site on a real hostname needs `allowedHosts: ['that.hostname']` (and usually `host: '0.0.0.0'`). Default localhost Host check would 403 `Host: snd.example`. Source: Express serving guide; Streamable HTTP “bind localhost” SHOULD is for **local** MCP servers.
5. **Same origin vs CORS** for the Operator UI is independent of the public form. Same-origin UI + `/mcp` needs no CORS headers. Cursor as a non-browser client needs Bearer (if you require it) and the MCP path; it does not need CORS.

Nothing in the spec or SDK forbids one Node process from serving UI, a public POST, and `/mcp`.

---

## 6. Facts that constrain a later tool-list decision (no list chosen here)

Leave the concrete tool set to ticket `05`. These protocol/SDK facts will bound that decision:

- **`tools/list` is not per-connection in 2026.** “List endpoints (`tools/list`, `resources/list`, `prompts/list`) no longer vary per-connection.” Cross-call state is explicit handles in tool arguments (SEP-2567). Source: [changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog).
- The v2 factory **may** still register a different tool set **per request** from `authInfo` (documented as building the instance around one caller). That is request-scoped, not session-scoped. Source: [Serve over HTTP](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/http.md).
- `scopeChallenge` / `requireScopes` **do not hide** tools from `tools/list`. “Challenged primitives remain visible in their list operations.” Source: [Require authorization](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/authorization.md).
- 2026 list/read results require **`ttlMs` and `cacheScope`** (`CacheableResult`, SEP-2549). Servers SHOULD return tools in **deterministic order**. Source: [changelog minor items 3 and 5](https://modelcontextprotocol.io/specification/2026-07-28/changelog).
- Clients that opt into change notifications use **`subscriptions/listen`** (`toolsListChanged`, …), not unsolicited `list_changed` and not HTTP GET. Source: [changelog item 4](https://modelcontextprotocol.io/specification/2026-07-28/changelog); Streamable HTTP message-flow diagrams.
- `x-mcp-header` on a tool parameter is a Streamable HTTP client requirement; a client MUST **drop an invalid tool from `tools/list`**. Source: [Custom Headers from Tool Parameters](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http). Avoid that annotation unless the list design wants header-mirrored params.
- One factory can serve **both eras** (`era` is passed in). Dual-era behavior differences (initialize vs `_meta`, GET vs `subscriptions/listen`) are tabulated in [Protocol versions](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/protocol-versions.md). A 2025-only client will not see 2026-only RPCs.

---

## Short answers (ticket questions)

| # | Answer |
|---|---|
| 1 | HTTP transport name: **Streamable HTTP**. stdio remains for subprocesses. **HTTP+SSE is deprecated.** 2026-07-28 also dropped sessions, GET SSE, and `initialize`. |
| 2 | v2: `createMcpHandler` + `toNodeHandler` (Node/Express/Fastify) or `handler.fetch` (Hono/fetch). Mount on `/mcp` (convention). Do not hand-wire v1 `StreamableHTTPServerTransport` for a new server. |
| 3 | Path example `/mcp`, POST-only in 2026. No `Mcp-Session-Id`. Origin **validation** (403) is required; CORS headers are **not** specified on `/mcp` and are not added by the handler. Non-browser clients omit Origin. |
| 4 | `Authorization: Bearer` on every MCP HTTP request, middleware in front of the handler. Not a JSON-RPC field. Optional OAuth 2.1 resource-server profile + RFC 9728 if you implement MCP authorization. |
| 5 | Yes: ordinary Express/Hono app, auth only on `/mcp`. Do not reuse `createMcpExpressApp`’s global Origin allowlist for the public form without checking browser Origins. |
| 6 | 2026 lists are not session-private; auth can still vary tools per request; scopes do not hide tools; caching fields and `subscriptions/listen` apply. |

---

## Sources (index)

Spec:

- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports
- https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http
- https://modelcontextprotocol.io/specification/2026-07-28/changelog
- https://modelcontextprotocol.io/specification/2026-07-28/deprecated
- https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
- https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations
- https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices
- https://modelcontextprotocol.io/seps/2596-spec-feature-lifecycle-and-deprecation

SDK (GitHub `main` = v2):

- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/http.md
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/express.md
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/hono.md
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/web-standard.md
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/authorization.md
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/legacy-clients.md
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/serving/sessions-state-scaling.md
- https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/protocol-versions.md
- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/express/src/express.ts
- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/middleware/express/src/middleware/originValidation.ts
- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/src/server/middleware/originValidation.ts
- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server/src/server/middleware/oauthMetadata.ts
- https://www.npmjs.com/package/@modelcontextprotocol/server (2.4.0)
- https://ts.sdk.modelcontextprotocol.io/v2/
