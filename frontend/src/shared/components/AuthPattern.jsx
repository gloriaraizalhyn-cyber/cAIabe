// Geometric tile motif from the cAIabe brand board. One 96x96 tile (2x2
// cells of 48px) repeats to fill whatever box the parent sizes.
const RED = "#ce1126";
const BLUE = "#0038a8";
const NAVY = "#00227a";
const YELLOW = "#fcd116";
const WHITE = "#ffffff";

function AuthPattern({ className, id = "auth-tile", scale = 1 }) {
  return (
    <svg className={className} width="100%" height="100%" aria-hidden="true" focusable="false">
      <defs>
        <pattern id={id} width="96" height="96" patternUnits="userSpaceOnUse" patternTransform={`scale(${scale})`}>
          {/* Row 1 */}
          <rect width="48" height="48" fill={RED} />
          <path d="M24 6l4 14 14 4-14 4-4 14-4-14-14-4 14-4z" fill={WHITE} />

          <rect x="48" width="48" height="48" fill={BLUE} />
          <path d="M72 6l18 18-18 18-18-18z" fill={WHITE} />
          <path d="M72 14l10 10-10 10-10-10z" fill={BLUE} />


          {/* Row 2 */}
          <rect y="48" width="48" height="48" fill={WHITE} />
          <circle cx="24" cy="72" r="17" fill={BLUE} />
          <circle cx="24" cy="72" r="9" fill={WHITE} />
          <circle cx="24" cy="72" r="4" fill={RED} />

          <rect x="48" y="48" width="48" height="48" fill={NAVY} />
          <path d="M48 96a48 48 0 0 1 48-48v48z" fill={WHITE} />

        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

export default AuthPattern;


