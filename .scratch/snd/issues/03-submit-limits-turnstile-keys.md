Type: grilling
Status: resolved

## Question

Welche harten Limits hat POST /submit (Body-Größe, Feldanzahl, Rate pro IP und pro Form)? Access Key rotieren: alter Key sofort tot oder Schonfrist? Turnstile ist optional: wenn das Secret auf der Form gesetzt ist, prüft das Backend den Token per siteverify — fail-closed bei Cloudflare-Ausfall oder fail-open? Welcher Feldname trägt den Token?

## Answer

50 Felder, 100 KB, 30/min IP, 60/min Form. Key-Rotation sofort. Turnstile optional, Token-Feld `cf-turnstile-response`, fail-closed. Siehe [spec.md](../spec.md).
