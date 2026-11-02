# snd

Self-hosted form-to-mail for static sites. One operator manages many websites through UI and MCP.

## Language

**Project**:
A website that may have forms. The isolation unit: allowed origins, identity, and stored submissions.
_Avoid_: Site, Client, Kunde, Tenant

**Form**:
A named intake on a Project, with recipients and a public submit endpoint. The HTML lives on the Project's static site, not in snd.
_Avoid_: Endpoint (the URL is not the Form)

**Access Key**:
The public identifier of a Form, embedded in the site's HTML. It only allows submitting to that Form.
_Avoid_: API key, Secret (it is not a secret)

**Submission**:
One accepted POST to a Form. Stored so the operator can count, inspect, and delete it.
_Avoid_: Entry, Eintrag, Lead, Message

**Notification**:
The email snd sends to a Form's recipients with a Submission's data.
_Avoid_: Mail, Alert

**SMTP Config**:
Host, port, credentials, and From used to send mail. One on Operator settings (admin mail), one on each Project (default for Notifications), optionally overridden on a Form.
_Avoid_: Mailer, Transport

**Operator**:
The single person, and their agents, allowed to manage the instance via UI and MCP.
_Avoid_: Admin, User, Customer

**Visitor**:
The person filling a Form on the static site. Not an account.
_Avoid_: User, Client
