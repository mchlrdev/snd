Type: grilling
Status: resolved
Blocked by: 06

## Question

Welche MCP-Tools genau, damit ein Agent Projects, Forms, SMTP Configs, Tests, Inbox und Löschen ohne UI schafft — und nichts darf, was nur der öffentliche Access Key kann? Wie verbindet sich der Agent (URL, Auth-Header), und ist die Tool-Liste 1:1 die Operator-UI oder absichtlich schmaler?

## Answer

Parität mit der UI. Anschluss `https://<instanz>/mcp`, `Authorization: Bearer` aus `SND_MCP_TOKEN`. Siehe [spec.md](../spec.md) und Research 06.
