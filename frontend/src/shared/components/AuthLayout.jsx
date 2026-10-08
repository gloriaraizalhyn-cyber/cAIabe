import AuthPattern from "./AuthPattern.jsx";
import "./AuthLayout.css";

// Shared shell for the driver and admin log-in pages: a brand panel beside a
// clean form card. `art` is an optional panel illustration, `points` the short
// value list under the tagline.
function AuthLayout({ role, tagline, points = [], art, eyebrow, title, subtitle, children, footer }) {
  return (
    <div className="auth-page">
      <main className="auth-layout">
        <aside className="auth-layout__brand">
          <AuthPattern className="auth-layout__pattern auth-layout__pattern--side" id="auth-tile-side" />
          <AuthPattern className="auth-layout__pattern auth-layout__pattern--base" id="auth-tile-base" scale={0.4} />
          <div className="auth-layout__brand-body">
            {art && <div className="auth-layout__art">{art}</div>}
            <p className="auth-layout__role">{role}</p>
            <p className="auth-layout__tagline">{tagline}</p>
            <ul className="auth-layout__points">
              {points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="auth-layout__panel">
          <div className="auth-layout__card">
            <header className="auth-layout__header">
              <span className="auth-layout__eyebrow">{eyebrow}</span>
              <h1 className="auth-layout__title">{title}</h1>
              <p className="auth-layout__subtitle">{subtitle}</p>
            </header>

            {children}

            {footer && <div className="auth-layout__footer">{footer}</div>}
          </div>
        </section>

      </main>
    </div>
  );
}

export default AuthLayout;



