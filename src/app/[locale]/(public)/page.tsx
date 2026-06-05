import { redirect } from "@/i18n/navigation";

/**
 * The public root goes straight to the configurator: the marketing
 * landing page is owned by the client elsewhere (see AGENTS.md) and
 * links here with CTAs.
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/configurator", locale });
}
