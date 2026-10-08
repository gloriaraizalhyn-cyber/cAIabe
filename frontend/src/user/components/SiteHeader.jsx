import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, X } from "lucide-react";
import "./SiteHeader.css";

// Same header as the landing page, for inner pages. Section links go back to
// the landing page and scroll to that section (the landing page reads
// `location.state.scrollTo`).
const SECTIONS = [
  { id: "top", label: "Home" },
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How it works" },
  { id: "routes", label: "Routes" },
];

function SiteHeader() {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const goToSection = (id) => (event) => {
    event.preventDefault();
    setIsMenuOpen(false);
    navigate("/", { state: { scrollTo: id } });
  };

  const handleReportProblem = () => {
    setIsMenuOpen(false);
    window.location.href = "mailto:support@caiabe.app?subject=Landing page issue";
  };

  const handleApplyAsDriver = () => {
    setIsMenuOpen(false);
    navigate("/driver/register");
  };

  return (
    <header className="site-header">
      <a href="/" className="site-header__brand" onClick={goToSection("top")}>
        <img src="/images/caiabe-squared.jpg" alt="" className="site-header__brand-logo" />
        <span className="site-header__brand-text">
          c<span className="site-header__brand-ai">AI</span>abe
        </span>
      </a>

      <div className="site-header__right">
        <nav className="site-header__nav" aria-label="Page sections">
          {SECTIONS.map((section) => (
            <a key={section.id} href={`/#${section.id}`} onClick={goToSection(section.id)}>
              {section.label}
            </a>
          ))}
        </nav>

        <div className="site-header__menu-wrap">
          <button
            type="button"
            className="site-header__menu-button"
            aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          {isMenuOpen && (
            <div className="site-header__menu" role="menu">
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  role="menuitem"
                  className="site-header__menu-link"
                  onClick={goToSection(section.id)}
                >
                  {section.label}
                </button>
              ))}
              <span className="site-header__menu-divider" aria-hidden="true" />
              <button type="button" role="menuitem" onClick={handleReportProblem}>
                Report a problem
              </button>
              <button type="button" role="menuitem" onClick={handleApplyAsDriver}>
                Apply as a driver
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default SiteHeader;
