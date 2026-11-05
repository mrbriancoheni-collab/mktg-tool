import type { CatalogItem } from "../../shared/catalog";
import { BRAND_ICONS } from "./brandIcons.generated";
import { CATALOG_ICONS } from "./catalogIcons.generated";

export function Icon({ name, size = 16, ...rest }: { name: string; size?: number; color?: string; className?: string }) {
  const C = CATALOG_ICONS[name] ?? CATALOG_ICONS.Circle;
  return <C size={size} {...rest} />;
}

/** Light brand colours (e.g. Mailchimp yellow, Snapchat) need dark glyphs. */
function isLight(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 186;
}

/**
 * Coloured tile with the element's icon: the real brand logo when one is
 * available, otherwise a Lucide icon in the brand's colour.
 */
export function ItemIcon({ item, size = 30, className = "" }: { item?: CatalogItem; size?: number; className?: string }) {
  const color = item?.color ?? "#64748b";
  const fg = item?.kind === "note" ? "#78350f" : isLight(color) ? "#111" : "#fff";
  const brand = item?.brand ? BRAND_ICONS[item.brand] : undefined;
  const glyph = Math.round(size * 0.55);
  return (
    <span className={`item-icon ${className}`} style={{ background: color, width: size, height: size, borderRadius: size * 0.26 }}>
      {brand ? (
        <svg role="img" viewBox="0 0 24 24" width={glyph} height={glyph} fill={fg} aria-label={brand.title}>
          <path d={brand.path} />
        </svg>
      ) : (
        <Icon name={item?.icon ?? "Circle"} size={glyph} color={fg} />
      )}
    </span>
  );
}
