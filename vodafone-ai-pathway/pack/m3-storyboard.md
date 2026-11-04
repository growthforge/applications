# Module M3 storyboard: Notes to follow-up, in 15 minutes

> **Illustrative.** A sample storyboard written for an independent job application. Not Vodafone material; not produced, reviewed or endorsed by Vodafone. Customers, names and notes are fictional. Sign-offs marked “to be agreed” are placeholders.

## Module summary

| Field | Value |
|---|---|
| Pathway | AI pathway for account managers, stage two (A weekly workflow), weeks 3 to 9 |
| Module | M3 Notes to follow-up |
| Format | Digital, self-paced, then on the job |
| Length | 15 minutes, eight screens |
| Outcome | You can turn your own meeting notes into a follow-up that promises only what the notes support, and you can tell a draft you can send from one you must fix or escalate. |
| Job aid | Prompt card M3 (see `prompt-card-m3.md`) |
| Items | `skills-check-item-bank.json`: practice M3-P1 to M3-P3 (screen 5), scored check M3-C1 (screen 7) |
| SMEs | Two experienced account managers supply realistic notes and review the drafts (to be agreed) |
| Sign-off | Skill Lead (to be agreed); data protection colleague reviews screens 2, 4 and 8 for the data rule |
| Version | 0.4, review by 1 February 2027 |

## Design reasoning, screen by screen

| Screen | Why it is there |
|---|---|
| 1. Objective | A testable outcome, stated first, in the learner’s words. |
| 2. Hook from a real task | The risk comes before the skill, so the learner knows why the next screens matter. |
| 3. Worked example | See it done once, in full, with nothing skipped. |
| 4. Good and flawed output | A flawed example teaches the check better than a rule. |
| 5. Practice | Practice is a decision about real work, not recall of a definition. |
| 6. Feedback | Feedback names the rule, so the decision transfers to the next task. |
| 7. Check | Retrieval now; the same rule returns on a realistic observed task in week 9, then on real work in stage three. |
| 8. Job aid handover | The support moves into the moment of work, where most learning happens. |

## Build rules for every screen

- **No timer** on any screen or question. The learner moves on when ready.
- **Keyboard alone**: every control reachable with Tab, radio groups with the arrow keys, buttons with Enter or Space. Visible focus on every control.
- **Captions and a transcript** for any recording. Captions are human-checked, not automatic only.
- **Plain, short sentences** in Global English: one idea per sentence, no idioms, so the module translates and localises cleanly.
- **Contrast and size** to WCAG 2.2 AA. Targets at least 24 by 24 px; answer options as full-width rows.
- **Feedback per option**, never only “Correct” or “Incorrect”, and never colour alone: each verdict names the expected option in words.
- **Localisation hooks**: customer names, currency, date format and the market note are variables; the rule and the decision never change.
- **Record**: the option chosen for each item (screens 5 and 7), and an optional confidence rating. Do not report completion or time on screen as impact.

## Screen 1. Objective (1 min)

**On screen (heading):** Notes to follow-up

**On screen (body):**
> You will turn your own meeting notes into a follow-up that promises only what the notes support.
>
> This takes about 15 minutes. At the end you save a card you can use on your next real follow-up this week.

**Interaction:** Button “Start”.

**Developer note:** State the outcome first, in the learner’s words. No welcome video, no feature tour.

## Screen 2. Hook from a real task (1 min)

**On screen (heading):** What went wrong?

**On screen (body):**
> A follow-up promised a delivery date that nobody agreed. It reached the customer’s finance director, who planned around it.

Show the short email (fictional customer, Northgate Builders) with the date sentence visible:

> “...and your 40 new handsets will be delivered by 14 March.”

**Interaction:** Free-text reflection, optional and not stored: “What went wrong, in one line?” Then “Show what happened”.

**Reveal:**
> The meeting notes said “delivery date to be confirmed”. The AI draft filled the gap with a date, and nobody checked it before sending. The tool did not lie on purpose: it completed the pattern. The check is yours.

**Developer note:** The risk comes before the skill, so the learner knows why the next screens matter.

## Screen 3. Worked example (3 min)

**On screen (heading):** One prompt, built in four parts

**Media:** a captioned screen recording, about two minutes, with a transcript link under the player. The recording shows a mock-up, not a live customer system.

**Narration script (captions match exactly):**

1. “Here are my notes from Tuesday’s meeting with Larchmoor Freight.”
2. “First, the goal. I write: draft a follow-up email to the Operations Director after today’s meeting.”
3. “Second, the context. I am their account manager. They want to renew their mobile plan and asked about trailer tracking.”
4. “Third, the source. I tell Copilot to use only my notes, and I attach the notes file. This line stops the draft inventing.”
5. “Fourth, the expectations. Under 150 words, plain British English, three bullet points, one next step offering the specialist’s two times from the notes. And I ask Copilot to list anything it was unsure about.”
6. “Now I run it. Before I send anything, I check every commitment against my notes.”

**On screen beside the player (the four parts, as a static list):** Goal, Context, Source, Expectations.

**Interaction:** Play, pause, captions on by default, transcript link. Button “Next”.

**Developer note:** Show it done once, in full, with nothing skipped. Highlight each prompt part as the narrator names it.

## Screen 4. Good and flawed output (2 min)

**On screen (heading):** The same prompt, two drafts

**On screen (instruction):**
> Underline every commitment and find it in the notes.

**Draft A (good):**
> “...you would like to know more about tracking for your 25 trailers. I will confirm where tracking data is stored.”

**Draft B (flawed):**
> “...tracking for your 25 trailers, which we will include at no extra cost.”

**Interaction:** The learner selects each phrase in each draft that commits to something (click or keyboard select). Then “Compare with the notes”.

**Feedback:**
> Draft A commits to one thing: you will confirm where data is stored. The notes say you said you would check. Supported.
>
> Draft B commits to tracking at no extra cost. The notes say no pricing was discussed. Not supported.

**Developer note:** A flawed example teaches the check better than a rule. If selectable text is not possible in the authoring tool, use a multiple-select question with the phrases as options.

## Screen 5. Practice (3 min)

**On screen (heading):** Would you send this?

**On screen (left panel, always visible):** Larchmoor Freight (fictional): meeting notes, Tuesday. Four lines, from `sources.larchmoor_notes` in the item bank.

**Items:** M3-P1, M3-P2, M3-P3 from `skills-check-item-bank.json`, in that order. M3-P3 shows the customer’s reply (`sources.larchmoor_reply`) above Copilot’s drafted answer: “On Wednesday the customer replies: ... Copilot drafts your answer:”.

**Options (identical for every item):** Send it / Fix it, then send / Stop and escalate

**Interaction:** One single-choice question per draft. Button “Check my answer”. The learner may change the answer and check again. Practice is not scored.

**Feedback:** Shown under the button, announced to screen readers. A status token (“Matched” or “Not this time”) in charcoal, then the expected option named in words, then two labelled lines: “Your choice:” (the option’s own feedback, when it differs) and “Why the expected answer:” (the rationale). Text from `feedback` and `rationale` in the item bank, unchanged. Colour marks the expected outcome only, never right or wrong.

**Developer note:** Practice is a decision, not recall. Expected answers across the three are fix, send, escalate: one of each, so the learner cannot guess a pattern. Draft 1 and draft 3 both contain something nobody agreed; the difference the learner must see is that the notes alone put draft 1 right, while draft 3 cannot be made right without someone else’s decision.

## Screen 6. Feedback (1 min)

**On screen (heading):** The rule behind all three

**On screen (body):**
> Fix what your notes can put right. Escalate what only someone else can decide.
>
> You own every commitment in your draft: delete or correct anything the notes do not support.
>
> You do not own decisions on price, contract terms, where data is held or security. When putting a draft right needs one of those decisions, do not send: ask the owner, and tell the customer when to expect an answer.
>
> A question you said you would check is yours to route, the same day, whatever happens to the draft.

**Interaction:** Button “Next”.

**Developer note:** Naming the rule makes the decision transfer to the next task, which is not a follow-up email.

## Screen 7. Check (2 min)

**On screen (heading):** One new draft

**Item:** M3-C1 (Harlow Kitchens, fictional), scored. Notes shown in the left panel from `sources.harlow_notes`.

**Interaction:** As screen 5, one attempt scored, feedback after the attempt. Optional confidence rating after the answer (four points: guessing, unsure, fairly sure, certain). Confidence is stored for item review only and never reported as capability.

**On screen after feedback:**
> The same rule returns in the stage two check, on a realistic set of meeting notes, while your team leader observes. In stage three you use it on your own real work.

**Developer note:** Retrieval now, then the same rule on a realistic observed task in the ninth week (LTEM Tier 6; rubric in the item bank), and on real work in stage three (Tier 7).

## Screen 8. Job aid handover (2 min)

**On screen (heading):** Take the card

**On screen (body):**
> Save the M3 card to your team library and use it on your next real follow-up this week.
>
> In this week’s team practice slot, your team leader will ask one question: which commitment did you check?

**Interaction:** Buttons “Open the card” (prompt card M3) and “Finish”. The learner answers the experience questions: “Was this useful for a task you do?” and “Will you use it at work this week?” (yes, not sure, no). In the weekly practice slot the team leader asks the follow-up: “Did you use it at work this week?”

**Developer note:** The support moves into the moment of work, where most learning happens. The two questions feed the Experience measure (learner reaction); they are never reported as impact on their own.

## Review checklist before release

- [ ] Two account managers confirm the notes and drafts are realistic for the role.
- [ ] The Skill Lead signs off M3-C1 and its feedback.
- [ ] The data protection colleague confirms screens 2, 4 and 8 state the data rule correctly.
- [ ] Captions checked by a person; transcript available.
- [ ] Keyboard-only run through all eight screens, with a screen reader on screens 5 and 7.
- [ ] Market versions: names, currency and date format swapped; the market note added to the card.
- [ ] Owner, version and review date on the module and on the card.

---

Prepared by Hemanth Vallamkonda as part of an application to Vodafone. Independent and illustrative; uses public information only.
