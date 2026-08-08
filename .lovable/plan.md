# Phase 1 — Frontend-only intake prototype

Fictional data only. No backend, no auth, no Cloud, no AI. All priority values are mock; nothing is calculated in the browser.

## Routes

| Path | Purpose |
| --- | --- |
| `/` | Redirects to `/intake/demo-form` (index placeholder must go) |
| `/intake/$publishedFormId` | Public enquiry form (multi-section, single page with sticky progress) |
| `/intake/$publishedFormId/submitted` | Confirmation screen with the exact required wording |
| `/login` | Staff login UI placeholder — form posts nowhere, "Sign in" navigates to `/app/enquiries` |
| `/app` | Staff layout: sidebar/topbar chrome + `<Outlet />` |
| `/app/enquiries` | Dashboard: 5 summary cards + enquiry table |
| `/app/enquiries/$id` | Enquiry detail |
| `/app/settings` | Firm settings placeholder |

Each route gets its own `head()` metadata; staff routes marked `noindex`.

## Component structure

```text
src/components/intake/
  IntakeShell.tsx        firm header, privacy notice link, automated-rules statement
  SectionCard.tsx        titled card wrapper for each section
  FieldRow.tsx           label + control + error + hint
  RadioGroupField.tsx    accessible radio set
  CheckboxGroupField.tsx multi-select with disabled-state support
  KnownDateField.tsx     "Do you know the exact date?" -> date input -> past-date confirm
  ConflictSection.tsx
src/components/staff/
  StaffLayout.tsx  SummaryCards.tsx  PriorityBadge.tsx
  EnquiryTable.tsx  DetailField.tsx
src/lib/intake/
  schema.ts        zod schema + option constants
  visibility.ts    pure show/hide predicates (UX only)
src/lib/mock/
  enquiries.ts     fictional enquiry records
  firm.ts          fictional firm profile + settings
```

Form state: `react-hook-form` + `zod` (already a shadcn-friendly pattern), single form object, no persistence.

## Form sections

1. Privacy — Hamilton Immigration Solicitors, placeholder Privacy Notice link, automated-rules statement.
2. Your details — full name, email, phone, preferred contact method, preferred contact time.
3. Enquiry category — 11 options as specified, plus conditional follow-ups.
4. Location — inside UK / outside UK / not sure.
5. Urgency facts — multi-select with exclusivity rules + date sub-flows.
6. Conflict-check info — previous names, spouse/partner name, sponsoring employer, existing representative Y/N, plus the "do not provide case facts or documents" instruction. No free-text narrative, no upload.

## Conditional visibility logic (UX only)

- category = refusal/decision -> "Does the letter itself mention any of these words?" (Appeal / Administrative review / Neither / Not sure)
- category = "Detention / removal enquiry" -> always show both:
  - "Are you currently detained?" (Yes / No / Not sure)
  - "Have you been given a removal/deportation date?" (Yes / No / Not sure); if **Yes**, run the same exact-date flow used everywhere else.
- urgency includes "visa expires soon" -> visa expiry date flow
- urgency includes "hearing date" -> hearing date flow
- urgency includes "removal/deportation date" -> removal date flow
- urgency includes "given a deadline" -> stated deadline date flow
- category = refusal/decision **OR** urgency includes "received a Home Office decision" -> "Does your letter state a response deadline?"; if "Yes — deadline stated", run the date flow
- Exclusivity: selecting any substantive urgency option disables "None of these" and "Not sure"; selecting either exclusive option clears and disables all others. Implemented in one reducer so the rule can't drift.
- Hidden answers are cleared on hide so stale values are never submitted.
- None of these conditional answers feed any priority computation — visibility only.

### Shared exact-date flow (`KnownDateField`)

1. "Do you know the exact date?" — "Yes, I know the exact date" / "No / not sure".
2. Only on **Yes** does the date input appear.
3. If the entered date is before today, show verbatim:

   "The date you entered has already passed. Is this the date you intended to enter?"

   Options: "Yes, that's correct" / "No, let me fix it".
4. "Yes, that's correct" keeps the value and dismisses the prompt. "No, let me fix it" clears the value and returns focus to the date field for re-entry.

This is data-entry validation only. The UI never says or implies that a legal deadline has passed or expired.


## Mock data structure

```ts
type Priority = "CRITICAL" | "URGENT" | "PRIORITY" | "MANUAL_REVIEW" | "ROUTINE";

interface MockEnquiry {
  id: string;                 // "ENQ-2026-0142"
  receivedAt: string;         // ISO
  priority: Priority;         // hardcoded, never derived
  category: string;
  status: "New" | "In review" | "Contacted" | "Awaiting client" | "Closed";
  assignedTo: string | null;
  location: string;
  contactPreference: { method: string; time: string };
  statedDates: { label: string; value: string | "Not known" }[];
  matchedRuleId: string;      // "RULE-HO-DEC-14D" placeholder
  acknowledgementSent: true;
  prospect: { name: string; email: string; phone: string };
  conflictCheck: { previousNames; partnerName; sponsoringEmployer; existingRepresentative };
}
```

~12 records covering all five priorities and a spread of categories/statuses. Summary card counts derive from counting mock rows by their stored priority — a display count, not a classification.

## Design

Serious UK legal-software look: deep navy/slate ink, warm off-white surfaces, a single muted accent, restrained priority badge colours (critical = deep red, routine = neutral). Serif display face for headings (e.g. Source Serif) with a clean grotesk for body/UI, generous whitespace, hairline borders instead of heavy shadows, no gradients or animation beyond focus/hover states. All colours as semantic tokens in `src/styles.css`. Mobile: sections stack, dashboard table collapses to cards, 44px touch targets, visible focus rings, fieldset/legend for radio and checkbox groups.

## Changes I suggest to the brief

1. **Confirmation as its own route** rather than an in-place state swap, so it survives refresh and is linkable.
2. **A staff `/app` layout route** with shared nav, since three staff screens are specified.
3. **`/` redirects to a demo intake link** so the app opens on something real; the form ID is displayed but treated as an opaque label only.
4. **A visible "Prototype — fictional data" marker** on staff screens, so no one mistakes mock priorities for real triage output.
5. **Phone/email validation kept deliberately light** (format only, no required-format enforcement on phone) to avoid blocking urgent enquiries.

Say the word and I'll build it.
