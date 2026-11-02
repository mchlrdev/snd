Type: grilling
Status: resolved
Blocked by: 01

## Question

Wenn Notification oder Admin-Mail über SMTP scheitert: wie oft Retry, mit welchem Abstand, wo liegt die Queue, und wann geht die Failure-Mail an den Operator (jeder Fehlschlag vs. erst nach Ausschöpfen)? Was steht in dieser Mail, und was passiert mit der Submission inzwischen (schon gespeichert vs. erst nach erfolgreichem Send)?

## Answer

Submission zuerst, Besucher sofort Erfolg, Queue in SQLite, 8 Versuche / 24h. Benachrichtigung global (Werkseinstellung sofort), pro Form überschreibbar: sofort / erst wenn aufgegeben / aus. Siehe [spec.md](../spec.md).
