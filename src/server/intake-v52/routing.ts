import {
  ROUTING_RULE_VERSION,
  type CanonicalIntakeSubmission,
  type Condition,
  type DerivedFacts,
  type Priority,
  type RoutingResult,
} from "./contracts.ts";
import { daysUntilCalendarDate } from "./date.ts";

const FIELD_GROUPS = {
  all_stated_dates: [
    "visa_expiry_date",
    "hearing_date_value",
    "removal_date_value",
    "other_deadline_date",
    "decision_stated_deadline_date",
  ],
  all_date_known_fields: [
    "visa_expiry_date_known",
    "hearing_date_value_known",
    "removal_date_value_known",
    "other_deadline_date_known",
    "decision_stated_deadline_date_known",
  ],
} as const;

const RULES: { rule_id: string; priority: Priority; conditions: Condition }[] = [
  {
    rule_id: "CRITICAL_DETAINED",
    priority: "CRITICAL",
    conditions: { field: "effective_detained", operator: "boolean_true" },
  },
  {
    rule_id: "CRITICAL_REMOVAL_DATE",
    priority: "CRITICAL",
    conditions: { field: "effective_removal_date", operator: "boolean_true" },
  },
  {
    rule_id: "CRITICAL_PAST_DATE_CONFIRMED",
    priority: "CRITICAL",
    conditions: { field: "past_date_confirmations", operator: "object_any_equals", value: true },
  },
  {
    rule_id: "CRITICAL_DATE_RANGE",
    priority: "CRITICAL",
    conditions: { field_group: "all_stated_dates", operator: "in_range", value: [0, 3] },
  },
  {
    rule_id: "URGENT_DATE_RANGE",
    priority: "URGENT",
    conditions: { field_group: "all_stated_dates", operator: "in_range", value: [4, 14] },
  },
  {
    rule_id: "URGENT_DECISION_NO_DEADLINE",
    priority: "URGENT",
    conditions: {
      all: [
        { field: "effective_decision_received", operator: "boolean_true" },
        { field: "decision_deadline_status", operator: "equals", value: "No deadline stated" },
      ],
    },
  },
  {
    rule_id: "PRIORITY_DATE_RANGE",
    priority: "PRIORITY",
    conditions: { field_group: "all_stated_dates", operator: "in_range", value: [15, 28] },
  },
  {
    rule_id: "MANUAL_NOT_SURE_URGENCY",
    priority: "MANUAL_REVIEW",
    conditions: { field: "urgency_flags", operator: "contains", value: "not_sure" },
  },
  {
    rule_id: "MANUAL_NOT_SURE_DECISION_DEADLINE",
    priority: "MANUAL_REVIEW",
    conditions: { field: "decision_deadline_status", operator: "equals", value: "Not sure" },
  },
  {
    rule_id: "MANUAL_NOT_SURE_CATEGORY",
    priority: "MANUAL_REVIEW",
    conditions: { field: "category", operator: "equals", value: "Not sure" },
  },
  {
    rule_id: "MANUAL_NOT_SURE_LETTER",
    priority: "MANUAL_REVIEW",
    conditions: { field: "letter_mentions", operator: "equals", value: "Not sure" },
  },
  {
    rule_id: "MANUAL_DATE_UNKNOWN",
    priority: "MANUAL_REVIEW",
    conditions: {
      field_group: "all_date_known_fields",
      operator: "any_equals",
      value: "No / not sure",
    },
  },
  {
    rule_id: "MANUAL_DETENTION_UNRESOLVED",
    priority: "MANUAL_REVIEW",
    conditions: { field: "detention_category_unresolved", operator: "boolean_true" },
  },
  {
    rule_id: "MANUAL_LOCATION_UNCERTAIN",
    priority: "MANUAL_REVIEW",
    conditions: { field: "location_uncertain", operator: "boolean_true" },
  },
  {
    rule_id: "ROUTINE_FALLBACK",
    priority: "ROUTINE",
    conditions: { operator: "default" },
  },
];

const PRIORITY_RANK: Record<Priority, number> = {
  CRITICAL: 5,
  URGENT: 4,
  PRIORITY: 3,
  MANUAL_REVIEW: 2,
  ROUTINE: 1,
};

type RoutingContext = CanonicalIntakeSubmission & DerivedFacts;

function getField(context: RoutingContext, field: string): unknown {
  return (context as unknown as Record<string, unknown>)[field];
}

export function evaluateCondition(
  condition: Condition,
  context: RoutingContext,
  now: Date = new Date(),
): boolean {
  if (condition.all) return condition.all.every((item) => evaluateCondition(item, context, now));
  if (condition.any) return condition.any.some((item) => evaluateCondition(item, context, now));

  const operator = condition.operator;
  if (!operator) throw new Error("Condition is missing an operator");
  if (operator === "default") return true;

  if (operator === "any_equals" || operator === "in_range") {
    if (!condition.field_group) throw new Error(`${operator} requires field_group`);
    const group = FIELD_GROUPS[condition.field_group as keyof typeof FIELD_GROUPS];
    if (!group) throw new Error(`Unknown field group: ${condition.field_group}`);

    if (operator === "any_equals") {
      return group.some((field) => getField(context, field) === condition.value);
    }

    const range = condition.value;
    if (!Array.isArray(range) || range.length !== 2) {
      throw new Error("in_range requires [min, max]");
    }
    const [min, max] = range;
    if (typeof min !== "number" || typeof max !== "number") {
      throw new Error("in_range requires numeric bounds");
    }
    return group.some((field) => {
      const value = getField(context, field);
      if (typeof value !== "string" || value === "") return false;
      const days = daysUntilCalendarDate(value, now);
      return days !== null && days >= min && days <= max;
    });
  }

  if (!condition.field) throw new Error(`${operator} requires field`);
  const fieldValue = getField(context, condition.field);

  switch (operator) {
    case "equals":
      return fieldValue === condition.value;
    case "contains":
      return Array.isArray(fieldValue) && fieldValue.includes(condition.value);
    case "object_any_equals":
      return (
        fieldValue !== null &&
        typeof fieldValue === "object" &&
        !Array.isArray(fieldValue) &&
        Object.values(fieldValue as Record<string, unknown>).some(
          (value) => value === condition.value,
        )
      );
    case "boolean_true":
      return fieldValue === true;
    case "boolean_false":
      return fieldValue === false;
    default:
      throw new Error(`Unsupported condition operator: ${String(operator)}`);
  }
}

export function routeSubmission(
  input: CanonicalIntakeSubmission,
  derivedFacts: DerivedFacts,
  now: Date = new Date(),
): RoutingResult {
  const context: RoutingContext = { ...input, ...derivedFacts };
  const matched = RULES.filter(
    (rule) =>
      rule.conditions.operator !== "default" && evaluateCondition(rule.conditions, context, now),
  );

  if (matched.length === 0) {
    return {
      priority: "ROUTINE",
      matched_rule_ids: ["ROUTINE_FALLBACK"],
      priority_reason: "Matched ROUTINE_FALLBACK",
      derived_facts: derivedFacts,
      routing_rule_version: ROUTING_RULE_VERSION,
    };
  }

  const highestRank = Math.max(...matched.map((rule) => PRIORITY_RANK[rule.priority]));
  const highest = matched.filter((rule) => PRIORITY_RANK[rule.priority] === highestRank);
  const priority = highest[0]!.priority;

  return {
    priority,
    matched_rule_ids: matched.map((rule) => rule.rule_id),
    priority_reason: `Highest severity matched: ${highest.map((rule) => rule.rule_id).join(", ")}`,
    derived_facts: derivedFacts,
    routing_rule_version: ROUTING_RULE_VERSION,
  };
}

export const ROUTING_RULES_V52 = RULES;
export const ROUTING_FIELD_GROUPS_V52 = FIELD_GROUPS;
