"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Turnstile } from "@/components/ui-domain/turnstile";
import { NextStepPill, PillIcon } from "@/components/ui-domain/next-step-pill";
import { Loader2, Truck } from "lucide-react";
import type { Cart } from "@/lib/cart/cart";
import { orderFormSchema } from "@/lib/orders/schema";
import { encodeSetParam } from "@/lib/cart/set-code";

/**
 * TODO:nb-review NO copy: orderForm.city («Poststed» — the client's own word,
 * from the card, but it has never been seen in the form's layout) and
 * orderForm.submitKicker («Send bestilling», R4-FIX Ⓕ).
 *
 * Order form (F05): client-validated with the SAME zod schema as the server,
 * Turnstile token attached. Success → clear cart + redirect to confirmation;
 * error → cart preserved, gentle message.
 *
 * F16: reached from the CartDrawer (no longer inline in step 3).
 */
export function OrderForm({
  cart,
  onSuccess,
}: {
  cart: Cart;
  onSuccess: () => void;
}) {
  const t = useTranslations("orderForm");
  const to = useTranslations("order");
  const locale = useLocale() as "no" | "en";
  const router = useRouter();

  const [form, setForm] = useState({
    customerName: "",
    email: "",
    phone: "",
    address: "",
    zipcode: "",
    city: "",
    country: "",
    message: "",
  });
  const [token, setToken] = useState("");
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = orderFormSchema.safeParse(form);
    if (!parsed.success) {
      const errs: Record<string, boolean> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = true;
      setErrors(errs);
      return;
    }
    setErrors({});
    setStatus("sending");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          locale,
          turnstileToken: token,
          items: cart.map((l) => ({
            supplierId: l.supplierId,
            supplierName: l.supplierName,
            productId: l.productId,
            productName:
              locale === "no" ? l.productNameNo : l.productNameEn,
            unitPriceCents: l.unitPriceCents,
            currency: l.currency,
            quantity: l.quantity,
            configCode: l.configCode,
            configSnapshot: l.configSnapshot,
            productSlug: l.productSlug,
            appliedRuleId: l.dealRuleId,
          })),
        }),
      });
      if (!res.ok) {
        setStatus("error");
        return; // cart preserved
      }
      const { code, total } = (await res.json()) as {
        code: string;
        total?: number;
      };
      // F30-B: carry the set (CA-3 codec) so the confirmation page can recap it
      // with mini-plates + a share link — built BEFORE onSuccess clears the cart.
      const set = encodeSetParam(
        cart.map((l) => ({
          configCode: l.configCode,
          productSlug: l.productSlug,
          quantity: l.quantity,
        }))
      );
      onSuccess();
      const qs = new URLSearchParams({ code });
      if (set) qs.set("set", set);
      // R4-TAKK: the SERVER's net total (minor units), so the thank-you page
      // and the confirmation email quote the same figure. Display only — the
      // page never charges anything, so a hand-edited value misleads nobody
      // but its author.
      if (typeof total === "number") qs.set("total", String(total));
      router.push(`/order?${qs.toString()}`);
    } catch {
      setStatus("error");
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="order-form"
      className="flex flex-col gap-3"
    >
      <h3 className="text-lg font-semibold">{to("title")}</h3>

      <label className="text-sm">
        {t("name")}
        <Input
          value={form.customerName}
          onChange={(e) => set("customerName", e.target.value)}
          aria-invalid={errors.customerName}
          data-testid="order-name"
          className="mt-1"
          autoComplete="name"
        />
      </label>
      <label className="text-sm">
        {t("email")}
        <Input
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          aria-invalid={errors.email}
          data-testid="order-email"
          className="mt-1"
          autoComplete="email"
        />
      </label>
      <label className="text-sm">
        {t("phone")}
        <Input
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          data-testid="order-phone"
          className="mt-1"
          autoComplete="tel"
        />
      </label>
      <label className="text-sm">
        {t("address")}
        <Input
          value={form.address}
          onChange={(e) => set("address", e.target.value)}
          aria-invalid={errors.address}
          data-testid="order-address"
          className="mt-1"
          autoComplete="street-address"
        />
      </label>
      {/* R4-ORDERS-PLUS voce C: postnummer and poststed are read together on a
          label, so they share a row; the country moves to its own, where three
          fields side by side would be squeezed at 375px. */}
      <div className="flex gap-3">
        <label className="flex-1 text-sm">
          {t("zipcode")}
          <Input
            value={form.zipcode}
            onChange={(e) => set("zipcode", e.target.value)}
            aria-invalid={errors.zipcode}
            data-testid="order-zipcode"
            className="mt-1"
            autoComplete="postal-code"
          />
        </label>
        <label className="flex-[2] text-sm">
          {t("city")}
          <Input
            value={form.city}
            onChange={(e) => set("city", e.target.value)}
            aria-invalid={errors.city}
            data-testid="order-city"
            className="mt-1"
            autoComplete="address-level2"
          />
        </label>
      </div>
      <label className="text-sm">
        {t("country")}
        <Input
          value={form.country}
          onChange={(e) => set("country", e.target.value)}
          aria-invalid={errors.country}
          data-testid="order-country"
          className="mt-1"
          autoComplete="country-name"
        />
      </label>
      <label className="text-sm">
        {t("message")}
        <Textarea
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
          data-testid="order-message"
          className="mt-1"
          rows={3}
        />
      </label>

      {/* Legal: quiet, greyed reference to the policy pages (pre-launch).
          Sits right under the message box (−mt tightens the gap); rich text →
          translators own the link labels; routes match the footer. */}
      <p
        data-testid="order-legal"
        className="-mt-1 text-xs leading-relaxed text-muted-foreground"
      >
        {t.rich("legal", {
          terms: (chunks) => (
            <Link
              href="/terms"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link
              href="/privacy"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>

      <Turnstile onToken={setToken} />

      {status === "error" && (
        <p data-testid="order-error" className="text-sm text-destructive">
          {to("error")}
        </p>
      )}

      {/* R4-FIX Ⓕ — the same pill the configurator ends on («Fullfør
          bestilling», step 3), truck and all: the last click of the funnel must
          not change language into a flat rectangle. Disabled until Turnstile
          has answered, so a click that could only fail is not offered. */}
      <NextStepPill
        type="submit"
        data-testid="order-submit"
        className="w-full"
        caption={t("submitKicker")}
        label={status === "sending" ? to("sending") : t("submit")}
        arrow={
          status === "sending" ? (
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            true
          )
        }
        aria-busy={status === "sending"}
        disabled={status === "sending" || cart.length === 0 || !token}
        icon={
          <PillIcon>
            <Truck className="size-5 text-primary" />
          </PillIcon>
        }
      />
    </form>
  );
}
