export type Priority = "CRITICAL" | "URGENT" | "PRIORITY" | "MANUAL_REVIEW" | "ROUTINE";

export type EnquiryStatus = "New" | "In review" | "Contacted" | "Awaiting client" | "Closed";

export interface MockEnquiry {
  id: string;
  receivedAt: string; // ISO
  /** Hardcoded fictional value. Never derived from intake answers. */
  priority: Priority;
  category: string;
  status: EnquiryStatus;
  assignedTo: string | null;
  location: string;
  contactPreference: { method: string; time: string };
  statedDates: { label: string; value: string }[];
  /** Neutral display-only placeholder. Encodes nothing. */
  matchedRuleId: string;
  acknowledgementSent: boolean;
  prospect: { name: string; email: string; phone: string };
  conflictCheck: {
    previousNames: string;
    partnerName: string;
    sponsoringEmployer: string;
    existingRepresentative: string;
  };
}

export const PRIORITY_ORDER: Priority[] = [
  "CRITICAL",
  "URGENT",
  "PRIORITY",
  "MANUAL_REVIEW",
  "ROUTINE",
];

export const PRIORITY_LABELS: Record<Priority, string> = {
  CRITICAL: "Critical",
  URGENT: "Urgent",
  PRIORITY: "Priority",
  MANUAL_REVIEW: "Manual review",
  ROUTINE: "Routine",
};

export const MOCK_ENQUIRIES: MockEnquiry[] = [
  {
    id: "ENQ-2026-0142",
    receivedAt: "2026-08-07T21:14:00Z",
    priority: "CRITICAL",
    category: "Detention / removal enquiry",
    status: "New",
    assignedTo: "A. Whitfield",
    location: "Inside the UK",
    contactPreference: { method: "Phone call", time: "Any time" },
    statedDates: [
      { label: "Removal/deportation date stated", value: "12 August 2026" },
      { label: "Hearing date stated", value: "Not known" },
    ],
    matchedRuleId: "DEMO-RULE-001",
    acknowledgementSent: true,
    prospect: {
      name: "Idris Bello",
      email: "i.bello@example.com",
      phone: "+44 7700 900142",
    },
    conflictCheck: {
      previousNames: "Idris Bello-Adams",
      partnerName: "Not provided",
      sponsoringEmployer: "Not provided",
      existingRepresentative: "No",
    },
  },
  {
    id: "ENQ-2026-0141",
    receivedAt: "2026-08-07T18:02:00Z",
    priority: "CRITICAL",
    category: "Asylum / protection",
    status: "In review",
    assignedTo: "S. Okonjo",
    location: "Inside the UK",
    contactPreference: { method: "SMS", time: "Morning" },
    statedDates: [{ label: "Hearing date stated", value: "19 August 2026" }],
    matchedRuleId: "MOCK-ROUTE-001",
    acknowledgementSent: true,
    prospect: {
      name: "Amira Haddad",
      email: "a.haddad@example.com",
      phone: "+44 7700 900141",
    },
    conflictCheck: {
      previousNames: "Not provided",
      partnerName: "Karim Haddad",
      sponsoringEmployer: "Not provided",
      existingRepresentative: "Yes",
    },
  },
  {
    id: "ENQ-2026-0140",
    receivedAt: "2026-08-07T15:47:00Z",
    priority: "URGENT",
    category: "I received a refusal or Home Office decision",
    status: "New",
    assignedTo: null,
    location: "Inside the UK",
    contactPreference: { method: "Email", time: "Afternoon" },
    statedDates: [{ label: "Response deadline stated in letter", value: "26 August 2026" }],
    matchedRuleId: "DEMO-RULE-002",
    acknowledgementSent: true,
    prospect: {
      name: "Lucia Ferreira",
      email: "l.ferreira@example.com",
      phone: "+44 7700 900140",
    },
    conflictCheck: {
      previousNames: "Not provided",
      partnerName: "Not provided",
      sponsoringEmployer: "Northgate Logistics Ltd",
      existingRepresentative: "No",
    },
  },
  {
    id: "ENQ-2026-0139",
    receivedAt: "2026-08-07T11:20:00Z",
    priority: "URGENT",
    category: "I have an appeal/tribunal matter already open",
    status: "Contacted",
    assignedTo: "A. Whitfield",
    location: "Inside the UK",
    contactPreference: { method: "Phone call", time: "Morning" },
    statedDates: [{ label: "Hearing date stated", value: "3 September 2026" }],
    matchedRuleId: "DEMO-RULE-002",
    acknowledgementSent: true,
    prospect: {
      name: "Peter Nowak",
      email: "p.nowak@example.com",
      phone: "+44 7700 900139",
    },
    conflictCheck: {
      previousNames: "Not provided",
      partnerName: "Hanna Nowak",
      sponsoringEmployer: "Not provided",
      existingRepresentative: "Yes",
    },
  },
  {
    id: "ENQ-2026-0138",
    receivedAt: "2026-08-06T16:31:00Z",
    priority: "PRIORITY",
    category: "Settlement / Indefinite Leave to Remain",
    status: "In review",
    assignedTo: "M. Prendergast",
    location: "Inside the UK",
    contactPreference: { method: "Either", time: "Evening" },
    statedDates: [{ label: "Visa/permission expiry stated", value: "30 September 2026" }],
    matchedRuleId: "DEMO-RULE-003",
    acknowledgementSent: true,
    prospect: {
      name: "Grace Mensah",
      email: "g.mensah@example.com",
      phone: "+44 7700 900138",
    },
    conflictCheck: {
      previousNames: "Grace Owusu",
      partnerName: "Not provided",
      sponsoringEmployer: "Not provided",
      existingRepresentative: "No",
    },
  },
  {
    id: "ENQ-2026-0137",
    receivedAt: "2026-08-06T13:05:00Z",
    priority: "PRIORITY",
    category: "Sponsor licence / business immigration",
    status: "Awaiting client",
    assignedTo: "M. Prendergast",
    location: "Inside the UK",
    contactPreference: { method: "Email", time: "Any time" },
    statedDates: [{ label: "Deadline stated by prospect", value: "Not known" }],
    matchedRuleId: "MOCK-ROUTE-002",
    acknowledgementSent: true,
    prospect: {
      name: "Daniel Reeve",
      email: "d.reeve@example.com",
      phone: "+44 7700 900137",
    },
    conflictCheck: {
      previousNames: "Not provided",
      partnerName: "Not provided",
      sponsoringEmployer: "Reeve & Sons Manufacturing Ltd",
      existingRepresentative: "No",
    },
  },
  {
    id: "ENQ-2026-0136",
    receivedAt: "2026-08-06T09:48:00Z",
    priority: "MANUAL_REVIEW",
    category: "Not sure",
    status: "New",
    assignedTo: null,
    location: "Not sure / other",
    contactPreference: { method: "Phone call", time: "Afternoon" },
    statedDates: [{ label: "Dates provided", value: "Not known" }],
    matchedRuleId: "DEMO-RULE-004",
    acknowledgementSent: true,
    prospect: {
      name: "Chen Wei",
      email: "c.wei@example.com",
      phone: "+44 7700 900136",
    },
    conflictCheck: {
      previousNames: "Not provided",
      partnerName: "Not provided",
      sponsoringEmployer: "Not provided",
      existingRepresentative: "Not sure",
    },
  },
  {
    id: "ENQ-2026-0135",
    receivedAt: "2026-08-05T19:12:00Z",
    priority: "MANUAL_REVIEW",
    category: "Other immigration matter",
    status: "In review",
    assignedTo: "S. Okonjo",
    location: "Outside the UK",
    contactPreference: { method: "Email", time: "Morning" },
    statedDates: [{ label: "Dates provided", value: "Not known" }],
    matchedRuleId: "DEMO-RULE-004",
    acknowledgementSent: true,
    prospect: {
      name: "Sofia Marchetti",
      email: "s.marchetti@example.com",
      phone: "+44 7700 900135",
    },
    conflictCheck: {
      previousNames: "Not provided",
      partnerName: "Not provided",
      sponsoringEmployer: "Not provided",
      existingRepresentative: "No",
    },
  },
  {
    id: "ENQ-2026-0134",
    receivedAt: "2026-08-05T14:26:00Z",
    priority: "ROUTINE",
    category: "Citizenship / nationality",
    status: "Contacted",
    assignedTo: "R. Ahmed",
    location: "Inside the UK",
    contactPreference: { method: "Email", time: "Any time" },
    statedDates: [{ label: "Dates provided", value: "Not known" }],
    matchedRuleId: "DEMO-RULE-005",
    acknowledgementSent: true,
    prospect: {
      name: "Fatima Yusuf",
      email: "f.yusuf@example.com",
      phone: "+44 7700 900134",
    },
    conflictCheck: {
      previousNames: "Not provided",
      partnerName: "Omar Yusuf",
      sponsoringEmployer: "Not provided",
      existingRepresentative: "No",
    },
  },
  {
    id: "ENQ-2026-0133",
    receivedAt: "2026-08-05T10:03:00Z",
    priority: "ROUTINE",
    category: "EU Settlement Scheme",
    status: "Closed",
    assignedTo: "R. Ahmed",
    location: "Inside the UK",
    contactPreference: { method: "SMS", time: "Evening" },
    statedDates: [{ label: "Dates provided", value: "Not known" }],
    matchedRuleId: "DEMO-RULE-005",
    acknowledgementSent: true,
    prospect: {
      name: "Elena Popescu",
      email: "e.popescu@example.com",
      phone: "+44 7700 900133",
    },
    conflictCheck: {
      previousNames: "Elena Dumitru",
      partnerName: "Not provided",
      sponsoringEmployer: "Not provided",
      existingRepresentative: "No",
    },
  },
  {
    id: "ENQ-2026-0132",
    receivedAt: "2026-08-04T17:39:00Z",
    priority: "ROUTINE",
    category: "Making a new application",
    status: "Awaiting client",
    assignedTo: "R. Ahmed",
    location: "Outside the UK",
    contactPreference: { method: "Either", time: "Afternoon" },
    statedDates: [{ label: "Dates provided", value: "Not known" }],
    matchedRuleId: "MOCK-ROUTE-003",
    acknowledgementSent: true,
    prospect: {
      name: "Arjun Patel",
      email: "a.patel@example.com",
      phone: "+44 7700 900132",
    },
    conflictCheck: {
      previousNames: "Not provided",
      partnerName: "Meera Patel",
      sponsoringEmployer: "Bramley Health Group",
      existingRepresentative: "No",
    },
  },
  {
    id: "ENQ-2026-0131",
    receivedAt: "2026-08-04T08:55:00Z",
    priority: "URGENT",
    category: "I received a refusal or Home Office decision",
    status: "In review",
    assignedTo: "A. Whitfield",
    location: "Inside the UK",
    contactPreference: { method: "Phone call", time: "Morning" },
    statedDates: [{ label: "Response deadline stated in letter", value: "Not known" }],
    matchedRuleId: "DEMO-RULE-002",
    acknowledgementSent: true,
    prospect: {
      name: "Marcus Bright",
      email: "m.bright@example.com",
      phone: "+44 7700 900131",
    },
    conflictCheck: {
      previousNames: "Not provided",
      partnerName: "Not provided",
      sponsoringEmployer: "Not provided",
      existingRepresentative: "No",
    },
  },
];

export function getMockEnquiry(id: string): MockEnquiry | undefined {
  return MOCK_ENQUIRIES.find((e) => e.id.toLowerCase() === id.toLowerCase());
}

/** Display count of fixture rows by their stored priority — not a classification. */
export function countByPriority(): Record<Priority, number> {
  return PRIORITY_ORDER.reduce(
    (acc, p) => {
      acc[p] = MOCK_ENQUIRIES.filter((e) => e.priority === p).length;
      return acc;
    },
    {} as Record<Priority, number>,
  );
}

export function formatReceived(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}
