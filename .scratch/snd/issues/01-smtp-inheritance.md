Type: grilling
Status: resolved

## Question

SMTP Config hängt an drei Stellen: Admin (Einstellungen), Project, Form-Override. Was genau überschreibt eine Form — den ganzen Block oder einzelne Felder? Was muss ein Verbindungstest tun (TCP/Auth vs. Testmail), und wo liegen die Passwörter, sodass UI und MCP sie setzen aber nicht im Klartext zurücklesen müssen?

## Answer

Form-Override ersetzt den ganzen SMTP-Block. Test sendet eine echte kurze Mail an eine angegebene Adresse. Passwörter write-only, at rest mit `SND_SECRET`. Siehe [spec.md](../spec.md).
