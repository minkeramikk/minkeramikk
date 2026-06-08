/**
 * Legal page renderer (F12). Turns a dictionary `legal.*.body` string into
 * readable prose: blank lines (\n\n) split blocks; within a block the first line
 * is a sub-heading and the rest are paragraphs. Texts come from the dictionaries
 * (NO from the live site, EN draft pending client review) — never inlined here.
 */
export function LegalArticle({
  title,
  body,
  testid,
}: {
  title: string;
  body: string;
  testid?: string;
}) {
  const blocks = body.split("\n\n").map((b) => b.trim()).filter(Boolean);

  return (
    <article
      data-testid={testid}
      className="mx-auto max-w-2xl py-10 sm:py-14"
    >
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="flex flex-col gap-5 text-sm leading-relaxed text-foreground/90">
        {blocks.map((block, i) => {
          const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
          if (lines.length === 1) {
            return <p key={i}>{lines[0]}</p>;
          }
          const [head, ...rest] = lines;
          return (
            <section key={i}>
              <h2 className="mb-1.5 text-base font-semibold">{head}</h2>
              {rest.map((line, j) => (
                <p key={j} className="mb-1.5 last:mb-0">
                  {line}
                </p>
              ))}
            </section>
          );
        })}
      </div>
    </article>
  );
}
