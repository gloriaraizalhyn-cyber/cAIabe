import { COLOR_NAME_TO_HEX } from "../../shared/constants/driverRegistrationFixtures.js";

// Real drivers pick a color name off a fixed list at sign-up (see
// JEEPNEY_COLOR_OPTIONS) — they never see or enter a hex code. A handful of
// older/seed rows still have a raw hex string in `jeep_color` though, so
// this renders whichever the row actually has: a named color gets a swatch
// + its label, a legacy hex value gets a swatch of that exact color + the
// hex as its own label (nothing to prettify it into without guessing).
function JeepColorCell({ jeepColor }) {
  if (!jeepColor) return <span className="admin-driver-table__cell-muted">—</span>;

  const normalized = jeepColor.toLowerCase();
  const isHex = normalized.startsWith("#");
  const swatchColor = isHex ? jeepColor : COLOR_NAME_TO_HEX[normalized];
  const label = isHex ? jeepColor.toUpperCase() : jeepColor;

  return (
    <span className="admin-driver-table__color-cell">
      {swatchColor && (
        <span
          className="admin-driver-table__color-swatch"
          style={{ backgroundColor: swatchColor }}
        />
      )}
      {label}
    </span>
  );
}

export default JeepColorCell;
