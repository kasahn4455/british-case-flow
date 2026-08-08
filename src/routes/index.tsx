import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/intake/$publishedFormId", params: { publishedFormId: "demo-form" } });
  },
  component: () => null,
});
