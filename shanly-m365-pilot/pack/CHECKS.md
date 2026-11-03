# Automated checks on this pack

Run on 3 November 2026 by the validator kept with the source files (Node, with ajv and Microsoft's published JSON schemas). Every check passed. Status: validated against Microsoft's published schemas; not yet imported into a tenant.

| Result | Check | Detail |
|---|---|---|
| PASS | schema | sharepoint/complaints-register.site-script.json vs site-design-script-actions.schema.json |
| PASS | limits | complaints-register.site-script.json: 46 actions and subactions, 27004 characters |
| PASS | schema | sharepoint/uk-regional-settings.site-script.json vs site-design-script-actions.schema.json |
| PASS | limits | uk-regional-settings.site-script.json: 1 actions and subactions, 203 characters |
| PASS | schema | sharepoint/due-date.ack.column-format.json vs column-formatting.schema.json (v2) |
| PASS | schema | sharepoint/due-date.assessment.column-format.json vs column-formatting.schema.json (v2) |
| PASS | schema | sharepoint/due-date.nextsteps.column-format.json vs column-formatting.schema.json (v2) |
| PASS | schema | sharepoint/due-date.pathway.column-format.json vs column-formatting.schema.json (v2) |
| PASS | register | "UK bank holidays": 1 columns, 1 views, field XML, GUIDs, CAML and view fields |
| PASS | register | "Complaints register": 32 columns, 4 views, field XML, GUIDs, CAML and view fields |
| PASS | engine | register offsets (5, 10, 30, 56), formatter offsets and code labels match engine/clock.js |
| PASS | a11y | formatters: brackets balanced; every state has a text label; text contrast >= 4.5:1 and dot contrast >= 3:1 (WCAG 2.2) |
| PASS | schema | teams/confirm.card.json vs adaptive-card.json (template, placeholders as written, formats not checked) |
| PASS | schema | teams/confirm.card.json vs adaptive-card.json (placeholders replaced with sample values, formats checked) |
| PASS | teams | teams/confirm.card.json: version 1.4 features only, Teams limits, labelled inputs, 3200 bytes |
| PASS | schema | teams/reminder.card.json vs adaptive-card.json (template, placeholders as written, formats not checked) |
| PASS | schema | teams/reminder.card.json vs adaptive-card.json (placeholders replaced with sample values, formats checked) |
| PASS | teams | teams/reminder.card.json: version 1.4 features only, Teams limits, labelled inputs, 1410 bytes |
| PASS | schema | ai/output-schema.json is a valid draft-07 JSON Schema (strict mode) |
| PASS | schema | output contract accepts a well-formed answer and rejects a date written as 14/03/2026 |
| PASS | mapping | power-automate/FLOWS.md: 14 rows, 29 of 29 engine tests cited, all names exact |
| PASS | engine | node --test clock.test.mjs: 29 pass, 0 fail |
| PASS | rules | flow logic modelled in JavaScript matches the engine for every receipt date from 1 December 2025 to 30 November 2028 and at each code boundary (initiation, due dates, due soon, overdue, send-by, 28-day updates, code version) |
| PASS | copy | 13 pack files: no en or em dashes, no exclamation marks, house-style word list, Learn links dated |

What these checks cannot show: how SharePoint, Teams and Power Automate behave after import (calculated columns, card response paths, date formats). `HANDOVER.md` lists each item to confirm in a test site.
