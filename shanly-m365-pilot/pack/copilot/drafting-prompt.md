# Phase 1 drafting prompt: Copilot in Outlook

Status: written for Microsoft 365 Copilot in Outlook. It has not been run in the Group's tenant. Before the team uses it on real customer emails, IT and the data protection officer confirm that Copilot use for complaints correspondence is within the Group's policy (see `HANDOVER.md`).

## What it is for

A saved prompt the Complaints Team runs in Outlook, with the customer's email thread open, to get a first draft of one of three letters:

| Letter | Published commitment it supports (calendar days from the initiation date) |
|---|---|
| Acknowledgement | acknowledged within 5 days |
| Proposed pathway to resolution | a proposed pathway, with realistic timescales, within 10 days |
| Full assessment | a full assessment including the current position within 30 days |

Copilot only reads and drafts. It never writes a date, never sends anything and never decides anything. A person checks every word, puts in the dates from the register, and the letter goes through the approval flow (`power-automate/FLOWS.md`, Flow 3) before it is sent.

## How to use it

1. Open the customer's email in Outlook and open Copilot Chat from the ribbon. Microsoft's training material describes Copilot Chat in Outlook reviewing the open thread and drafting a reply that you then check and edit (read 3 Nov 2026: https://learn.microsoft.com/en-us/training/modules/manage-email-efficiently/4-create-replies).
2. Run the saved prompt below. Fill in the two lines at the top: which letter, and your notes (what has been agreed internally: actions, who is doing them). Leave the notes as "none" for an acknowledgement if there is nothing to add.
3. Read the draft against the email and the register. Check every fact, name and issue. Remove anything you cannot stand behind.
4. Dates: leave `[ACK_DUE]`, `[PATHWAY_DUE]` and `[ASSESSMENT_DUE]` as they are, or replace them from the register's AckDue, PathwayDue and AssessmentDue columns. Either way the approval flow fills any that remain from the register, so the dates always come from the register's rules.
5. Replace every other placeholder in square brackets (`[NAME]`, `[ROLE]`, `[TIMESCALE: ...]`, `[TO CONFIRM: ...]`). The approval flow refuses a letter that still contains a square bracket.
6. Paste the letter into the register item's LetterDraft column, choose LetterToSend, and set LetterStatus to "Ready for approval".

## The prompt

Copy everything inside the box.

```text
You are helping a member of the Complaints Team at a UK housebuilder draft one letter to a customer. Use the email thread that is open in Outlook and the notes below. A person will check, change and approve the letter before anything is sent. Do not send anything.

LETTER: [ACKNOWLEDGEMENT or PROPOSED PATHWAY or FULL ASSESSMENT]
NOTES FROM THE TEAM MEMBER: [paste notes, or write none]

Rules that always apply:
1. Never write a date, a day of the week or a number of days. Where the letter needs a date, use exactly one of these placeholders: [ACK_DUE], [PATHWAY_DUE], [ASSESSMENT_DUE]. Where it needs a timescale for an action, write [TIMESCALE: the action] for the team member to fill in.
2. Use only facts that are in the email thread or in the notes. If something the letter needs is missing, write [TO CONFIRM: what is needed]. Do not guess names, plot numbers, developments or what has happened.
3. Do not promise any outcome, repair, visit, refund, compensation or goodwill gesture. Do not admit liability or fault, do not speculate about causes, and do not give legal advice. You may acknowledge how the customer feels and thank them for explaining their concerns.
4. Write in courteous, plain British English: British spelling, short sentences, a calm and respectful tone, no jargon, no exclamation marks. Address the customer by the name they use in their email.
5. Do not repeat health, disability or other personal circumstances from the email, beyond a brief acknowledgement where the customer has raised them. Never include anyone else's personal details.
6. Refer to the complaint as [REFERENCE]. Sign off with:
   Yours sincerely,
   [NAME]
   [ROLE], The Complaints Team
7. Keep the letter under 250 words.

What each letter contains:
- ACKNOWLEDGEMENT: thank the customer; confirm that their complaint has been received and logged under reference [REFERENCE]; list the issues as you understand them from the email, briefly, as bullet points, and invite the customer to say if anything is missing or wrong; explain that the team will write with a proposed pathway to resolution, including realistic timescales, by [PATHWAY_DUE], and with a full assessment of the complaint, including the current position, by [ASSESSMENT_DUE].
- PROPOSED PATHWAY: thank the customer; restate the issues briefly; set out the proposed steps to resolve each issue, taken only from the notes, each with who will act and [TIMESCALE: the step]; explain that a full assessment, including the current position, will follow by [ASSESSMENT_DUE]; invite the customer to comment on the proposed steps.
- FULL ASSESSMENT: thank the customer; for each issue, set out the current position, what has been done and what remains, taken only from the notes; give next steps with [TIMESCALE: the step]; say that the team will keep the customer updated while anything remains open.

After the letter, add a short section headed "Notes for the team" (not part of the letter) that lists:
- anything you marked [TO CONFIRM: ...] and why;
- anything in the email that might be urgent for safety or for the home (for example water escaping, a smell of gas, no heating or hot water, an electrical danger, a door or window that will not lock), so a person can follow the emergency process at once;
- anything the customer says that suggests they may need extra support, so a person can decide how to handle it.

Output plain text only: the letter, then the notes.
```

## Saving the prompt and sharing it with the team

Microsoft's support article "Sharing prompts with a Team" (read 3 Nov 2026: https://support.microsoft.com/topic/2fa7a228-8645-4dc4-beec-d75d6d0bc752) describes these steps:

1. Run the prompt once, then hover over it and select **Save prompt**.
2. Open the Copilot Prompt Gallery (available from Microsoft Copilot Chat, Teams or Outlook) and go to **Your prompts**.
3. Hover over the prompt, select **Share prompt**, then **Share to team**, and choose the Complaints Team.

The article does not state which licences the sharing feature needs; IT confirms which Copilot licence the team has before the trial. If sharing to a team is not available, save the prompt in a short Word document in the Complaints Team's Teams channel and copy it from there.

## Changing the prompt

Treat the prompt as part of the process: one named owner in the Complaints Team, changes agreed with the team lead, and the date of each change noted at the top of this file. When a change affects what letters say about dates or commitments, check it against the published complaints process first. The Complaints Team's reading of the code governs over this prompt.
