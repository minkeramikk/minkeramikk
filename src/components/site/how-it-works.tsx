import { useTranslations } from "next-intl";

const stepKeys = ["step1", "step2", "step3"] as const;

export function HowItWorks() {
  const t = useTranslations("home.how");

  return (
    <section className="bg-secondary/40">
      <div className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="mb-12 text-center text-3xl">{t("title")}</h2>
        <div className="grid gap-8 sm:grid-cols-3">
          {stepKeys.map((key, i) => (
            <div key={key} className="flex flex-col items-center text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary font-heading text-lg text-primary-foreground">
                {i + 1}
              </div>
              <h3 className="font-heading text-lg">{t(`${key}Title`)}</h3>
              <p className="mt-2 max-w-xs text-sm text-muted-foreground">
                {t(`${key}Text`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
