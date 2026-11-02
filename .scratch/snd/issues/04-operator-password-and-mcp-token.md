Type: grilling
Status: resolved

## Question

Ein Operator, nur Passwort. Wie sitzt die UI-Session (Cookie, Dauer, Logout), wie das MCP-Token (langes Bearer, rotiertbar, getrennt vom Passwort)? Gibt es Passwort-Reset ohne zweite Person — und wenn nein, was ist der Wiederherstellungszug auf einer selbst gehosteten Instanz?

## Answer

`SND_PASSWORD` und `SND_MCP_TOKEN` in der Env. UI-Cookie gegen das Passwort. Kein Reset-Link, kein Passwort in der Datenbank. Siehe [spec.md](../spec.md).
