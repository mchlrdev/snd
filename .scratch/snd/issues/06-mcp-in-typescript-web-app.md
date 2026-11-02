Type: research
Status: resolved

## Question

Wie hängt man einen MCP-Server (offizielles TypeScript-SDK) in dieselbe TypeScript-Web-App wie REST/UI, per HTTP, mit Operator-Auth — welche Transport-API ist 2026 die stabile, und was muss davor sitzen (Pfad, Session, CORS)?

## Answer

Stabil ist **Streamable HTTP** (Spec 2026-07-28). HTTP+SSE ist deprecated; stdio nur für Subprozesse. SDK v2: `createMcpHandler` an `/mcp` auf derselben Node-App (`toNodeHandler` / `handler.fetch`). Auth ist HTTP `Authorization: Bearer` vor der Route, nicht JSON-RPC. Origin-Check am `/mcp`-Pfad; CORS-Header gehören nicht auf `/mcp`. Ein Prozess kann öffentlichen Submit und authentifiziertes MCP nebeneinander bedienen, wenn Bearer und Host/Origin nur `/mcp` treffen.

Findings: [mcp-in-typescript-web-app.md](../research/mcp-in-typescript-web-app.md)
