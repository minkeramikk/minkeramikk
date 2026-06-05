
export interface PreviewLayer {
  src: string;
  /** Recolorable layers blend with multiply (legacy-validated technique, ADR 0002). */
  recolor?: boolean;
}

/**
 * Live design preview (DESIGN-SYSTEM §3.11): stacked images, multiply
 * blending for recolorable layers, soft drop shadow.
 */
export function PreviewCanvas({
  layers,
  caption,
  alt,
  className,
}: {
  layers: PreviewLayer[];
  caption?: string;
  alt: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="relative mx-auto flex aspect-square max-w-[520px] items-center justify-center rounded-lg bg-card shadow-(--shadow-card)">
        <div
          className="relative h-[84%] w-[84%]"
          style={{ filter: "drop-shadow(0 14px 28px color-mix(in oklab, var(--mk-dark) 18%, transparent))" }}
        >
          {layers.map((layer, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- composited catalog art from storage
            <img
              key={`${layer.src}-${i}`}
              src={layer.src}
              alt={i === 0 ? alt : ""}
              className="absolute inset-0 h-full w-full object-contain"
              style={layer.recolor ? { mixBlendMode: "multiply" } : undefined}
            />
          ))}
        </div>
      </div>
      {caption && (
        <p className="mt-3 text-center text-xs italic text-muted-foreground">{caption}</p>
      )}
    </div>
  );
}
