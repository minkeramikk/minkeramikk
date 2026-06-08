"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Turnstile } from "@/components/ui-domain/turnstile";
import type { Cart } from "@/lib/cart/cart";
import { orderFormSchema } from "@/lib/orders/schema";

/**
 * Order form (F05): client-validated with the SAME zod schema as the server,
 * Turnstile token attached. Success → clear cart + redirect to confirmation;
 * error → cart preserved, gentle message.
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

  const [form, setForm] = useState({ customerName: "", email: "", phone: "", message: "" });
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
          })),
        }),
      });
      if (!res.ok) {
        setStatus("error");
        return; // cart preserved
      }
      const { code } = (await res.json()) as { code: string };
      onSuccess();
      router.push(`/order?code=${encodeURIComponent(code)}`);
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
        {t("message")}
        <Textarea
          value={form.message}
          onChange={(e) => set("message", e.target.value)}
          data-testid="order-message"
          className="mt-1"
          rows={3}
        />
      </label>

      <Turnstile onToken={setToken} />

      {status === "error" && (
        <p data-testid="order-error" className="text-sm text-destructive">
          {to("error")}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="min-h-11"
        disabled={status === "sending" || cart.length === 0}
        data-testid="order-submit"
      >
        {status === "sending" ? to("sending") : t("submit")}
      </Button>
    </form>
  );
}
