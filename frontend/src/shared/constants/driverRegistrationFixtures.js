// Placeholder data for driver registration. Routes/terminals here stand in
// for CAIABE's routes + terminal_routes tables until that's wired up —
// sample options only, not permanent values.

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

// Each route conceptually maps to CAIABE's terminal_routes relationship: a
// route has one or more terminals, and a terminal can serve multiple routes.
export const ROUTES_WITH_TERMINALS_FIXTURE = [
  {
    id: "route-balibago-dau",
    name: "Balibago → Dau",
    color: "Blue",
    terminals: [
      { id: "terminal-balibago-market", name: "Balibago Market Terminal", location: { lat: 15.1706, lng: 120.5787 } },
      { id: "terminal-dau-bus", name: "Dau Bus Terminal", location: { lat: 15.1697, lng: 120.6122 } },
    ],
  },
  {
    id: "route-dau-balibago",
    name: "Dau → Balibago",
    color: "Yellow",
    terminals: [
      { id: "terminal-dau-bus", name: "Dau Bus Terminal", location: { lat: 15.1697, lng: 120.6122 } },
      { id: "terminal-balibago-market", name: "Balibago Market Terminal", location: { lat: 15.1706, lng: 120.5787 } },
    ],
  },
  {
    id: "route-angeles-mabalacat",
    name: "Angeles → Mabalacat",
    color: "Green",
    terminals: [
      { id: "terminal-angeles-central", name: "Angeles Central Terminal", location: { lat: 15.1449, lng: 120.5887 } },
      { id: "terminal-mabalacat-crossing", name: "Mabalacat Crossing", location: { lat: 15.2222, lng: 120.573 } },
    ],
  },
];
