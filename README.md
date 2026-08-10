# Case Intake Hub

I am building a frontend-only prototype for a UK immigration law firm enquiry intake product.

This is PHASE 1 ONLY.

Do not implement a backend yet.
Do not connect Supabase yet.
Do not create authentication yet.
Do not create database tables yet.
Do not connect n8n.
Do not implement email or SMS sending.
Do not implement subscription/billing.
Do not use real client data.
Do not implement authoritative routing or urgency calculations in the browser.
Do not use an LLM, generative AI, or AI classification anywhere in the product.

The purpose of this phase is to create a professional, working frontend demo using fictional/mock data only.

The eventual product is:
Legal intake and workflow automation software for regulated UK immigration firms.

It is NOT:

an immigration adviser

a visa eligibility checker

a source of immigration advice

a legal deadline calculator

The eventual backend will be authoritative for routing and priority. Any frontend conditional logic built now exists only to show/hide relevant questions for user experience.

BUILD THESE ROUTES:

/intake/:publishedFormId
Public immigration enquiry form.

/login
Staff login UI placeholder only. No real authentication yet.

/app/enquiries
Staff dashboard using fictional mock enquiries.

/app/enquiries/:id
Individual enquiry detail screen using fictional mock data.

/app/settings
Firm settings UI placeholder only.

PUBLIC INTAKE FORM

SECTION 1 — Privacy

Show a fictional firm name, for example:
Hamilton Immigration Solicitors

Show a placeholder Privacy Notice link.

Show:

“We use automated rules to prioritise and route enquiries based on the answers you provide. These rules do not determine your immigration rights or provide legal advice.”

SECTION 2 — Your details

Fields:

Full name
Email
Phone

Preferred contact method:

Phone call

Email

SMS

Either

Preferred contact time:

Morning

Afternoon

Evening

Any time

SECTION 3 — What best describes your enquiry?

Options:

Making a new application

I received a refusal or Home Office decision

I have an appeal/tribunal matter already open

Detention / removal enquiry

Asylum / protection

Sponsor licence / business immigration

Citizenship / nationality

Settlement / Indefinite Leave to Remain

EU Settlement Scheme

Other immigration matter

Not sure

If the prospect selects:

“I received a refusal or Home Office decision”

show:

“Does the letter itself mention any of these words?”

Options:

Appeal

Administrative review

Neither

Not sure

If the prospect selects:

“Detention / removal enquiry”

show:

“Are you currently detained?”

Yes

No

Not sure

and:

“Have you been given a removal/deportation date?”

Yes

No

Not sure

SECTION 4 — Location

Question:

“Where are you currently?”

Options:

Inside the UK

Outside the UK

Not sure / other

SECTION 5 — Urgency facts

Question:

“Please tell us if any of the following apply.”

Multi-select options:

My visa/permission has or will expire soon

I have received a Home Office decision

I have been given a deadline

I have a hearing date

I am currently detained

I have been given a removal/deportation date

None of these

Not sure

UX RULE:

“None of these” and “Not sure” must each be mutually exclusive with all substantive options.

If the user selects any substantive option, disable None and Not sure.

If None is selected, clear and disable all other selections.

If Not sure is selected, clear and disable all other selections.

DATE UX

For visa expiry, hearing date, removal date and other stated deadline:

First ask:

“Do you know the exact date?”

Options:

Yes, I know the exact date

No / not sure

Only when Yes is selected should a date field appear.

If a past date is entered, show:

“The date you entered has already passed. Is this the date you intended to enter?”

Options:

Yes, that's correct

No, let me fix it

This is UX only. Do not determine whether a legal deadline has expired.

HOME OFFICE DECISION DEADLINE FLOW

If EITHER:

category = “I received a refusal or Home Office decision”

OR

urgency selections include “I have received a Home Office decision”

show:

“Does your letter state a response deadline?”

Options:

Yes — deadline stated

No deadline stated

Not sure

If Yes:

ask whether the user knows the exact date and use the same date flow described above.

IMPORTANT:

Never tell the user what their legal deadline is.
Never calculate a deadline.

SECTION 6 — Conflict-check information

For this fictional prototype show:

Previous names

Spouse/partner name

Sponsoring employer

Existing representative: Yes / No

Add a short instruction telling users not to provide detailed case facts or upload documents at this stage.

Do NOT add a general case-description/free-text narrative box.

Do NOT add document upload.

CONFIRMATION SCREEN

After fictional form submission show:

“Thank you for contacting Hamilton Immigration Solicitors. We have received your enquiry and will review the information provided.

Submitting this form does not mean that Hamilton Immigration Solicitors has agreed to act for you. Please do not assume that any immigration or tribunal deadline has been protected until the firm confirms this expressly.

If you believe you have an urgent deadline and have not already provided it above, please contact the firm directly and immediately.”

For this phase, submission may remain entirely local/mock. Do not build backend persistence.

STAFF DASHBOARD

Create a professional dashboard using fictional enquiries.

Include summary cards:

Critical

Urgent

Priority

Manual Review

Routine

Enquiry table columns:

Enquiry ID

Received

Priority

Category

Status

Assigned staff

Use fictional records demonstrating all five priority types.

IMPORTANT:

The priority values are MOCK DATA ONLY.

Do NOT implement frontend code that calculates CRITICAL, URGENT, PRIORITY, MANUAL REVIEW or ROUTINE from form answers.

ENQUIRY DETAIL SCREEN

Display fictional structured information such as:

Enquiry ID
Priority
Received time
Category
Location
Prospect-entered dates
Contact preference
Status
Assigned staff
Matched rule ID placeholder

Show:

“Automated acknowledgement sent ✓”

Use fictional data only.

Do not provide legal analysis or recommendations.

DESIGN

The visual style should feel like professional B2B legal software used by a UK law firm.

Use:

clean typography

restrained colours

lots of whitespace

clear hierarchy

professional cards/tables

excellent mobile responsiveness

accessible form controls

Avoid:

flashy AI gradients

excessive animations

chatbot UI

immigration imagery clichés

flags/passports/airplanes everywhere

consumer-style marketing graphics

The software should feel trustworthy, serious and operational.

IMPORTANT IMPLEMENTATION BOUNDARIES

For this phase:

Frontend controls only:

displaying fields

hiding/showing conditional questions

basic UX validation

mock navigation

fictional dashboard display

Frontend must NOT control:

authoritative priority

legal deadline calculation

legal interpretation

tenant identity

conflict clearance

legal conclusions

Before implementing anything, remain in PLAN MODE and give me:

proposed route/page architecture

proposed component structure

form sections

conditional visibility logic

mock-data structure

anything you believe should be changed from these instructions

DO NOT write or modify code yet.
Wait for approval of the plan.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://british-case-flow.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4b2d6079-5022-42f1-aa9f-d5e32943aecd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
