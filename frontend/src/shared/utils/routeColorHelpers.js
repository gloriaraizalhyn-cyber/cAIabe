// Official route colors from caiabe_seed_routes.sql
export const ROUTE_COLOR_MAPPINGS = {
  "#cb478d": { name: "Pink", hex: "#CB478D", textColor: "#ffffff", badgeBg: "#fdf2f8", badgeBorder: "#fbcfe8", badgeText: "#be185d" },
  "#cb4747": { name: "Red", hex: "#CB4747", textColor: "#ffffff", badgeBg: "#fef2f2", badgeBorder: "#fecaca", badgeText: "#b91c1c" },
  "#eb7819": { name: "Orange", hex: "#EB7819", textColor: "#ffffff", badgeBg: "#fff7ed", badgeBorder: "#fed7aa", badgeText: "#c2410c" },
  "#edf43d": { name: "Yellow", hex: "#EDF43D", textColor: "#854d0e", badgeBg: "#fefce8", badgeBorder: "#fef08a", badgeText: "#854d0e" },
  "#50c878": { name: "Green", hex: "#50C878", textColor: "#ffffff", badgeBg: "#f0fdf4", badgeBorder: "#bbf7d0", badgeText: "#15803d" },
  "#1989eb": { name: "Blue", hex: "#1989EB", textColor: "#ffffff", badgeBg: "#eff6ff", badgeBorder: "#bfdbfe", badgeText: "#1d4ed8" },
  "#800080": { name: "Purple", hex: "#800080", textColor: "#ffffff", badgeBg: "#faf5ff", badgeBorder: "#e9d5ff", badgeText: "#7e22ce" },
  "#574f54": { name: "Grey", hex: "#574F54", textColor: "#ffffff", badgeBg: "#f3f4f6", badgeBorder: "#e5e7eb", badgeText: "#374151" },
  "#ffffff": { name: "White", hex: "#FFFFFF", textColor: "#111827", badgeBg: "#f9fafb", badgeBorder: "#d1d5db", badgeText: "#111827" },
  "#e1ac7d": { name: "Gold", hex: "#E1AC7D", textColor: "#78350f", badgeBg: "#fffbeb", badgeBorder: "#fde68a", badgeText: "#92400e" },
};

export function getRouteColorMeta(colorHexOrName, routeName = "") {
  if (colorHexOrName) {
    const lower = colorHexOrName.toLowerCase().trim();
    if (ROUTE_COLOR_MAPPINGS[lower]) return ROUTE_COLOR_MAPPINGS[lower];
    
    // Check if plain color name was passed
    for (const meta of Object.values(ROUTE_COLOR_MAPPINGS)) {
      if (meta.name.toLowerCase() === lower) return meta;
    }
  }

  // Fallback by matching route names from caiabe_seed_routes.sql
  const r = (routeName || "").toLowerCase();
  if (r.includes("capaya")) return ROUTE_COLOR_MAPPINGS["#cb478d"]; // Pink
  if (r.includes("sapangbato")) return ROUTE_COLOR_MAPPINGS["#cb4747"]; // Red
  if (r.includes("carmenville")) return ROUTE_COLOR_MAPPINGS["#eb7819"]; // Orange
  if (r.includes("telabastagan") || r.includes("pampang - sm") || r.includes("villa")) return ROUTE_COLOR_MAPPINGS["#edf43d"]; // Yellow
  if (r.includes("marisol")) return ROUTE_COLOR_MAPPINGS["#50c878"]; // Green
  if (r.includes("pandan")) return ROUTE_COLOR_MAPPINGS["#1989eb"]; // Blue
  if (r.includes("balibago")) return ROUTE_COLOR_MAPPINGS["#574f54"]; // Grey
  if (r.includes("hensonville")) return ROUTE_COLOR_MAPPINGS["#ffffff"]; // White
  if (r.includes("holy angel") || r.includes("checkpoint")) return ROUTE_COLOR_MAPPINGS["#800080"]; // Purple
  if (r.includes("friendship")) return ROUTE_COLOR_MAPPINGS["#e1ac7d"]; // Gold

  return { name: "Red", hex: "#CB4747", textColor: "#ffffff", badgeBg: "#fef2f2", badgeBorder: "#fecaca", badgeText: "#b91c1c" };
}

