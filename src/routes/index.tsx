import { createFileRoute, redirect } from "@tanstack/react-router";

const DEMO_PUBLISHED_FORM_ID = "demo-form-hamilton-v52-0001";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({
      to: "/intake/$publishedFormId",
      params: { publishedFormId: DEMO_PUBLISHED_FORM_ID },
    });
  },
  component: () => null,
});
