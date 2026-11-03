# Trial plan, if you choose this

This is a plan for a small, reversible trial, written for the case where the Deputy Chairman and the Complaints Team decide this process is worth trying. It assumes nothing about the Group's priorities: if another process matters more, the same seven weeks and the same method apply to that one instead.

What I do not know yet, and would find out in week 1: how complaints are logged today (a spreadsheet, mailbox folders, Clixifix or another system), how many arrive each month, who drafts and who signs letters, and whether a register already exists. If the team already tracks these dates well, the trial stops at week 1 with a short note, and that is a good outcome.

## Seven weeks

| Week | With | What happens | What comes out |
|---|---|---|---|
| 1 | The Complaints Team | Sit with the team. Map today's process from email to concluding letter: who does what, where dates are kept, how reminders happen, where time goes. Count volumes and timings from the last few months, with the team's help and without copying personal data. Agree the measures below. | A one-page map of today's process, the volumes, the agreed measures, and a go or no-go for week 2 |
| 2 | IT (and the external partner, if IT wishes) | Build in a test site and a non-default environment: run the site script, load bank holidays, build the three flows in a solution with the service account, set up the data policy, retention and permissions in `HANDOVER.md`. Run the checks listed under "What has not been verified" in `README.md` (for example an email sent at 00:30 BST, the leap-day window, the card response paths and the calculated column values). DPO decision on using real emails in the shadow run. | A working test set-up, IT's review notes, the DPO's decision |
| 3 to 6 | The Complaints Team | Shadow run alongside the current process. Intake logs and the daily clock run; the team keeps working exactly as today. **No letters are sent by the tool**: Flow 3's send step is switched off and replaced with a note to the approver. Weekly 20-minute check-in: compare the register with the team's own record, note every difference and its cause. Usability test with five people in week 4. Fix what the team finds. | A weekly log of differences and fixes, the usability findings, a short list of changes |
| 7 | The Deputy Chairman, Complaints Team lead and IT Manager | Review the measures against the targets agreed in week 1, the team's view and IT's view. Decide: keep (move the solution to production, with the owners in `HANDOVER.md`), change (agree what and re-run a shorter shadow period) or stop (switch off as `HANDOVER.md` describes; the register stays as a record). | A decision and, if kept, a handover date |

If the DPO prefers not to use real emails in the shadow run, weeks 3 to 6 run on illustrative emails written with the team, and the measures that need real volumes move to a later, approved period.

## Measures to agree in week 1

These are targets for the team to set, not results. None has been measured.

| Measure | How it is counted | Example target to discuss |
|---|---|---|
| Every complaint is in the register | Complaints received in the shadow period against register rows, weekly | All of them, with any gap explained |
| Initiation dates agree | Tool's initiation date against the team's, for every complaint | All agree, or the difference is explained and fixed |
| Reminders come in time | Reminder posted before each send-by date | Every commitment in the period |
| Nothing goes overdue unnoticed | Overdue commitments that the team did not already know about | None |
| Time on date-keeping | Minutes per complaint spent logging and checking dates, from the week 1 baseline | A reduction the team agrees is worth having |
| Letters through approval | Drafts approved first time, and why others were returned | Agreed with the team lead |
| Reliability | Weekdays with a "clock ran" message | Every weekday |
| The team's view | Five-person usability test, and the week 7 question "would you keep it?" | A majority would keep it, with their changes |

## Five-person usability test (week 4)

Why five: Jakob Nielsen's article "Why You Only Need to Test with 5 Users" (Nielsen Norman Group, 18 March 2000, https://www.nngroup.com/articles/why-you-only-need-to-test-with-5-users/, read 3 Nov 2026) argues that testing with about five people finds most usability problems, and that several small rounds of testing are better than one large one. So: five people now, fix, and test again if the trial is kept.

**Who:** five people who would use it: coordinators, complaint handlers and the team lead. Thirty minutes each, one at a time, at their own desk with Outlook and Teams open.

**Material:** the test site with illustrative complaints only (fictional customers and developments). No real customer data.

**How:** I read each task aloud and say nothing else. I ask the person to think aloud. I note what they do, not what I hoped they would do.

### Tasks

1. "An email has just arrived in the complaints mailbox. Deal with it in Teams." (The illustrative email arrived on the Friday before a bank holiday Monday.)
2. "When must this complaint be acknowledged, and has it been?" (In the register.)
3. "You have a reminder in Teams. Find the complaint it is about."
4. "Draft the acknowledgement for this complaint and send it for approval." (Using the saved Copilot prompt and the register.)
5. "This email is a new defect report for the customer portal, not a complaint. Deal with it."
6. "Which complaints need something from the team this week?"

### What to observe

- Time to finish each task, and whether it was finished without help.
- Where people hesitate, what they read twice, and what they miss on the Teams cards.
- Whether they check the initiation date and the due dates or accept them without looking, and whether they understand why a bank holiday moved the start.
- How they read the labels: in particular whether "Due soon" (two calendar days in the list) and the reminder (two working days) cause confusion.
- Whether "Not a complaint" feels safe to press, and whether anyone presses it by mistake.
- Any placeholder left in a draft, and whether the approval step catches it.

### Questions afterwards

1. What was the most confusing moment?
2. What would you change first?
3. How does this compare with how you keep these dates today?
4. Is there anything here you would not trust, and why?
5. What would stop you using this every day?
6. If we kept only one part, which should it be?

Findings are written up the same day as a short list: problem, how many of the five hit it, the change proposed. The Complaints Team lead decides which changes are made before week 7.
