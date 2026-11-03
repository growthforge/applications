// pilot-data.js: the four illustrative emails in the mock-up (fictional customers and developments).
// Each "suggestion" is copied unchanged from the smoke test (pack/ai/eval/runs/run2-haiku-outputs.jsonl):
// the triage prompt's real answer for that email, produced by a stand-in model. Generated, not hand-written.
export const SUGGESTION_NOTE = 'In this mock-up the first read and the draft are the prompt\'s real output from the smoke test, produced by a stand-in model; in the pilot, Copilot does this step.';
export const EMAILS = [
 {
  "id": "D1",
  "ref": "CMP-2026-014 (illustrative)",
  "from": "Helen Marsh",
  "subject": "Formal complaint: Plot 14, Orchard Rise",
  "received": "2026-12-24",
  "development": "Orchard Rise",
  "body": "Dear Complaints Team,\n\nI am writing to make a formal complaint. We reserved Plot 14 at Orchard Rise on 9 January 2025 and completed on 27 June 2025. In October I reported that the kitchen worktop had split along a joint and the bath panel had come away. The customer care team agreed a repair within four weeks. Nobody has attended, two booked visits were cancelled on the morning, and my last two emails have had no reply. I have now reported this three times.\n\nPlease treat this as a formal complaint about the delay and the lack of communication.\n\nHelen Marsh",
  "suggestion": {
   "type": "formal_complaint",
   "possible_emergency": false,
   "confidence": "high",
   "reason": "The email says, \"Please treat this as a formal complaint about the delay and the lack of communication.\"",
   "customer_name": "Helen Marsh",
   "development": "Orchard Rise",
   "plot": "Plot 14",
   "reservation_date": "2025-01-09",
   "completion_date": "2025-06-27",
   "issues": [
    "kitchen worktop split along a joint",
    "bath panel come away",
    "agreed repair not carried out",
    "two booked visits cancelled on the morning",
    "no reply to last two emails"
   ],
   "previous_reference": null,
   "draft_reply": "Dear Helen,\n\nThank you for your email. We understand how frustrating this has been. We have received your formal complaint and logged it with the Complaints Team.\n\nThe issues you have raised are the kitchen worktop splitting along a joint, the bath panel coming away, the agreed repair not being carried out, two booked visits cancelled on the morning, and no reply to your last two emails.\n\nThe team will set out its proposed pathway to resolution by [PATHWAY_DUE].\n\nKind regards,\n\nThe Complaints Team"
  }
 },
 {
  "id": "D2",
  "ref": "",
  "from": "Daniel Okafor",
  "subject": "Two small things in our new home",
  "received": "2026-11-30",
  "development": "Kingfisher Meadow",
  "body": "Hello,\n\nWe moved into Plot 3 at Kingfisher Meadow last month and we love the house. Two small things: the main bedroom door has started sticking at the top, and there is a hairline crack in the plaster above the landing window. I have taken photos of both. What is the best way to get these looked at?\n\nThanks,\nDaniel",
  "suggestion": {
   "type": "aftercare_item",
   "possible_emergency": false,
   "confidence": "high",
   "reason": "The email reports a sticking door and a hairline crack and asks, \"What is the best way to get these looked at?\", with no sign of dissatisfaction with how things have been handled.",
   "customer_name": "Daniel Okafor",
   "development": "Kingfisher Meadow",
   "plot": "Plot 3",
   "reservation_date": null,
   "completion_date": null,
   "issues": [
    "main bedroom door has started sticking at the top",
    "hairline crack in the plaster above the landing window"
   ],
   "previous_reference": null,
   "draft_reply": "Dear Daniel,\n\nThank you for getting in touch about the main bedroom door and the hairline crack above the landing window at Plot 3, Kingfisher Meadow.\n\nThe quickest route for repairs is our online customer portal. There you can add the photos you have taken and track progress as the request moves forward. We have copied our customer care team into this email so they are aware of your report.\n\nKind regards,\n\nThe Complaints Team"
  }
 },
 {
  "id": "D3",
  "ref": "CMP-2026-013 (illustrative)",
  "from": "Priya Nair",
  "subject": "Complaint about a phone call",
  "received": "2026-11-27",
  "development": "Mill Lane",
  "body": "To whom it may concern,\n\nI rang customer care on Tuesday about the outstanding snags at Plot 27, Mill Lane. The person I spoke to was dismissive, told me the snags were 'cosmetic' and said someone would call me back the same day. No one did. I would like this logged as a complaint about the way I was spoken to and the missed call back.\n\nRegards,\nPriya Nair",
  "suggestion": {
   "type": "formal_complaint",
   "possible_emergency": false,
   "confidence": "high",
   "reason": "The email says, \"I would like this logged as a complaint about the way I was spoken to and the missed call back.\"",
   "customer_name": "Priya Nair",
   "development": "Mill Lane",
   "plot": "Plot 27",
   "reservation_date": null,
   "completion_date": null,
   "issues": [
    "outstanding snags",
    "dismissive manner from customer care",
    "promised call back the same day did not happen"
   ],
   "previous_reference": null,
   "draft_reply": "Dear Priya,\n\nThank you for taking the time to write to us. We have received your formal complaint and logged it with the Complaints Team.\n\nThe issues you have raised are the outstanding snags at Plot 27, Mill Lane, the way you were spoken to when you called customer care, and the promised call back that did not happen.\n\nThe team will set out its proposed pathway to resolution by [PATHWAY_DUE].\n\nKind regards,\n\nThe Complaints Team"
  }
 },
 {
  "id": "D4",
  "ref": "",
  "from": "Tom Ellery",
  "subject": "Management company question",
  "received": "2026-12-02",
  "development": "Orchard Rise",
  "body": "Hi there,\n\nCould you tell me who the management company will be for the shared areas at Orchard Rise, and when the first service charge statement is likely to be sent? I would like to set up the direct debit in good time.\n\nMany thanks,\nTom Ellery",
  "suggestion": {
   "type": "general_enquiry",
   "possible_emergency": false,
   "confidence": "high",
   "reason": "The email asks, \"Could you tell me who the management company will be for the shared areas at Orchard Rise\", which is a question about the development with no complaint.",
   "customer_name": "Tom Ellery",
   "development": "Orchard Rise",
   "plot": null,
   "reservation_date": null,
   "completion_date": null,
   "issues": [],
   "previous_reference": null,
   "draft_reply": "Dear Tom,\n\nThank you for your email about the shared areas and service charge at Orchard Rise.\n\nThe right person will reply to your questions about the management company and the first service charge statement.\n\nKind regards,\n\nThe Complaints Team"
  }
 }
];
