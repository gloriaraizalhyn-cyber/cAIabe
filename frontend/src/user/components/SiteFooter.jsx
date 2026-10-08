import { useNavigate } from "react-router-dom";
import AuthPattern from "../../shared/components/AuthPattern.jsx";
import "../pages/LandingPage.css";
import "./SiteFooter.css";

// Same footer as the landing page, for inner pages. It reuses the landing
// page's footer styles; section links return to the landing page and scroll
// to that section (the landing page reads `location.state.scrollTo`).
const SECTIONS = [
  { id: "top", label: "Home" },
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How it works" },
  { id: "routes", label: "Routes" },
];

function SiteFooter() {
  const navigate = useNavigate();

  const goToSection = (id) => (event) => {
    event.preventDefault();
    navigate("/", { state: { scrollTo: id } });
  };

  const goTo = (path) => (event) => {
    event.preventDefault();
    navigate(path);
  };

  return (
    <footer className="landing-page__footer site-footer">
      <AuthPattern className="site-footer__pattern" id="site-footer-tile" scale={0.4} />
      <div className="landing-page__footer-card">
        <div className="landing-page__footer-main">
          <div className="landing-page__footer-brand">
            <div className="landing-page__footer-logo">
              <img src="/images/caiabe-squared.jpg" alt="" className="landing-page__footer-logo-img" />
              <span className="landing-page__footer-wordmark">
                c<span className="landing-page__wordmark-ai">AI</span>abe
              </span>
            </div>
          </div>

          <nav className="landing-page__footer-links" aria-label="Footer">
            <div className="landing-page__footer-column">
              <span className="landing-page__footer-heading">Explore</span>
              {SECTIONS.map((section) => (
                <a key={section.id} href={`/#${section.id}`} onClick={goToSection(section.id)}>
                  {section.label}
                </a>
              ))}
            </div>
            <div className="landing-page__footer-column">
              <span className="landing-page__footer-heading">Drive with us</span>
              <a href="/driver/login" onClick={goTo("/driver/login")}>
                Driver log in
              </a>
              <a href="/driver/register" onClick={goTo("/driver/register")}>
                Apply as a driver
              </a>
            </div>
            <div className="landing-page__footer-column">
              <span className="landing-page__footer-heading">Support</span>
              <a className="landing-page__footer-mail" href="mailto:support@caiabe.app">
                support@caiabe.app
              </a>
            </div>
          </nav>
        </div>

        <div className="landing-page__footer-bottom">
          <span>© 2026 cAIabe. Made for Angeles City &amp; Pampanga commuters.</span>
          <span className="landing-page__footer-wave" aria-hidden="true" />
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;


