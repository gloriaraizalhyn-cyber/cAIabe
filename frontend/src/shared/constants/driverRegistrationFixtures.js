// Remaining static config for driver registration. Route/terminal options
// are now fetched for real from Supabase (see DriverRegistrationPage.jsx) —
// no fixture needed for those anymore.

export const JEEPNEY_COLOR_OPTIONS = [
  { value: "beige", label: "Beige" },
  { value: "gray", label: "Gray" },
  { value: "emerald", label: "Emerald" },
  { value: "blue", label: "Blue" },
  { value: "white", label: "White" },
  { value: "yellow", label: "Yellow" },
  { value: "red", label: "Red" },
  { value: "purple", label: "Purple" },
];

// Maps a jeepney/route color name (as stored in plain text, e.g. route.color)
// to a hex value for rendering dots/badges.
export const COLOR_NAME_TO_HEX = {
  beige: "#c9a876",
  gray: "#4b4b4b",
  emerald: "#1a9e5c",
  blue: "#2563eb",
  white: "#c9c9c9",
  yellow: "#e0a82e",
  red: "#c0392b",
  purple: "#7c3aed",
  green: "#1a9e5c",
};

export const ACCEPTED_DOCUMENT_PHOTO_TYPES = ["image/jpeg", "image/png"];
export const ACCEPTED_DOCUMENT_PHOTO_TYPES_LABEL = "JPG or PNG, up to 5MB";
