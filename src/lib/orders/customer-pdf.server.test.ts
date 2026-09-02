import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * R4-PDF-CLIENTE — il confine, difeso dal codice e non solo dalla policy.
 *
 * Il bucket `order-pdfs` è privato e senza policy (0037): l'unico lettore è il
 * service role, dietro l'autenticazione admin. L'INVARIANTE della card
 * (NOTA 2/9 sui riusi) è però più larga della policy — dice che *nessuna
 * superficie pubblica risolve un PDF* — e una policy non impedisce a nessuno di
 * aggiungere domani una route pubblica che firma un URL col service role.
 *
 * Questo test è quel divieto, scritto dove si nota: se una card futura vorrà
 * dare il PDF al cliente, dovrà cancellarlo di proposito — cioè riaprire la
 * decisione, che è esattamente ciò che la card chiede.
 */
const ROOT = join(__dirname, "..", "..");
const PUBLIC_SURFACES = ["app/[locale]", "components/ui-domain", "app/api"];
/** `/api/admin/**` non è una superficie pubblica: sta fuori dal middleware di
 *  auth e per questo si autoguarda con `getAdminUser()`, come la rotta del PDF
 *  lab accanto. È ammessa SOLO a quella condizione, e il test la verifica invece
 *  di fidarsi del percorso. */
const ADMIN_GUARDED = /app\/api\/admin\//;
const FORBIDDEN = /order-pdfs|customerPdfPath|fetchStoredCustomerPdf|renderAndStoreCustomerPdf|createSignedUrl/;

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("🔒 nessuna superficie pubblica risolve un PDF", () => {
  it.each(PUBLIC_SURFACES)("%s non nomina il bucket né i suoi accessori", (surface) => {
    const offenders = walk(join(ROOT, surface)).filter((f) => {
      const src = readFileSync(f, "utf8");
      if (!FORBIDDEN.test(src)) return false;
      // Una rotta admin può servirlo, ma solo se si autoguarda: è la stessa
      // regola della rotta del PDF lab, e qui è verificata, non assunta.
      if (ADMIN_GUARDED.test(f) && src.includes("getAdminUser()")) return false;
      return true;
    });
    expect(offenders.map((f) => f.replace(ROOT, "src"))).toEqual([]);
  });

  it("la rotta admin che serve il riepilogo SI AUTOGUARDA", () => {
    const route = readFileSync(
      join(ROOT, "app/api/admin/orders/[id]/summary/route.ts"),
      "utf8"
    );
    expect(route).toContain("const user = await getAdminUser();");
    expect(route).toMatch(/if \(!user\) return new NextResponse\("Unauthorized", \{ status: 401 \}\);/);
    // e serve, non rigenera
    expect(route).not.toContain("renderAndStoreCustomerPdf");
  });

  it("il percorso dell'oggetto non è indovinabile dal codice ordine", async () => {
    const { customerPdfPath } = await import("./customer-pdf.server");
    // I codici sono sequenziali (`'MK-' || nextval('order_seq')`, 0032:172): se
    // il nome dell'oggetto li usasse, il bucket diventerebbe enumerabile il
    // giorno in cui qualcuno esponesse il file.
    const path = customerPdfPath("0f9c1e2a-1111-4222-8333-444455556666");
    expect(path).toBe("summaries/0f9c1e2a-1111-4222-8333-444455556666.pdf");
    expect(path).not.toMatch(/MK-/);
  });
});
