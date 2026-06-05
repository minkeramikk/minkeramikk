/**
 * Layer dati del catalogo.
 * Oggi legge da catalog.json (estratto dal sito Squarespace attuale);
 * quando arriva Supabase basterà sostituire l'implementazione di queste
 * funzioni mantenendo le stesse firme.
 */
import catalog from "./catalog.json";

export type Product = {
  slug: string;
  name: string;
  priceKr: number;
  image: string;
};

export type PaletteColor = {
  name: string;
  hex: string;
  image: string;
};

export type Design = {
  slug: string;
  name: string;
  description: string;
  previewImage: string;
};

type CatalogItem = {
  url: string;
  name: string;
  price: number | null;
  hex: string | null;
};

const collections = catalog.collections as Record<string, CatalogItem[]>;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/å/g, "a")
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getProducts(): Product[] {
  return (collections["plates"] ?? [])
    .filter((i) => i.price != null)
    .map((i) => ({
      slug: slugify(i.name),
      name: i.name,
      priceKr: i.price as number,
      image: i.url,
    }));
}

export function getProduct(slug: string): Product | undefined {
  return getProducts().find((p) => p.slug === slug);
}

export function getPalette(): PaletteColor[] {
  return (collections["palettes"] ?? [])
    .filter((i) => i.hex != null)
    .map((i) => ({ name: i.name, hex: i.hex as string, image: i.url }));
}

/** I 6 design del configuratore, come sul sito attuale. */
export function getDesigns(): Design[] {
  const firstImage = (slug: string) => collections[slug]?.[0]?.url ?? "";
  return [
    {
      slug: "blomster-1",
      name: "Blomster 1",
      description: "Klassisk blomstermønster",
      previewImage: firstImage("floreal1-detaljer"),
    },
    {
      slug: "blomster-2",
      name: "Blomster 2",
      description: "Blomster med blader",
      previewImage: firstImage("floreal2-blader"),
    },
    {
      slug: "amalfi-dyr",
      name: "Amalfi Dyr",
      description: "Dyremotiver i Amalfi-stil",
      previewImage: firstImage("animals-preview"),
    },
    {
      slug: "krabbe",
      name: "Krabbe",
      description: "Krabbemotiv fra kysten",
      previewImage: firstImage("crabline"),
    },
    {
      slug: "striper",
      name: "Striper",
      description: "Enkle, elegante striper",
      previewImage: firstImage("stripes"),
    },
    {
      slug: "juletre",
      name: "Juletre",
      description: "Julemotiv med pynt",
      previewImage: firstImage("juletre"),
    },
  ];
}
