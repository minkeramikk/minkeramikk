import {
  Weight,
  Circle,
  Ruler,
  Tag,
  MoveVertical,
  MoveHorizontal,
  Container,
  type LucideIcon,
} from "lucide-react";
import type { AttributeKey } from "@/lib/catalog/product-attributes";

/**
 * The `icon` NAME each entry of `ATTRIBUTE_REGISTRY` carries, resolved to its
 * lucide component. It lives on the UI side of the line on purpose:
 * `product-attributes.ts` is React-free so `"server-only"` modules can import
 * it, and a map of components would drag lucide across that boundary.
 *
 * Adding an `AttributeKey` without its icon is a type error, so the two stay
 * in step without the registry knowing what a component is.
 */
export const ATTR_ICON: Record<AttributeKey, LucideIcon> = {
  weight: Weight,
  diameter: Circle,
  dimensions: Ruler,
  height: MoveVertical,
  length: MoveHorizontal,
  volume: Container,
  custom: Tag,
};
