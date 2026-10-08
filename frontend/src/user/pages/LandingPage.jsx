import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Sparkles,
  Radar,
  Armchair,
  Mic,
  MessageSquareText,
  Menu,
  X,
} from "lucide-react";
import MascotReveal from "../components/MascotReveal.jsx";
import "./LandingPage.css";

const FEATURES = [
  {
    icon: Sparkles,
    tag: "AI-Powered",
    title: "Ask, and get your route",
    description: "Type or speak where you're headed — the AI matches you to the right jeepney line.",
  },
  {
    icon: Radar,
    tag: "Live Tracking",
    title: "Watch it come to you",
    description: "See your jeepney move on the map in real time, before it even arrives.",
  },
  {
    icon: Armchair,
    tag: "Seat Status",
    title: "Know before you go",
    description: "Check if there's room to sit before you even leave the house.",
  },
  {
    icon: Mic,
    tag: "Voice Search",
    title: "Just say where you're headed",
    description: "No typing needed — speak your trip and let cAIabe do the rest.",
  },
];

const HOW_IT_WORKS = [
  {
    title: "Tell us about yourself",
    body: "One quick tap — student, PWD, senior citizen, or regular — so every fare we show is already correct for you.",
  },
  {
    title: "Find your route",
    body: "Type or speak your trip. The AI matches you to a real jeepney line and explains why it's the best pick right now.",
  },
  {
    title: "Track it to the bay",
    body: "Watch your jeepney approach on the live map, see if it has seats, and know exactly when to head out.",
  },
];

const ROUTES_SAMPLE = [
  { name: "Checkpoint – Holy Angel University", terminal: "Checkpoint" },
  { name: "Marisol – Pampang", terminal: "Checkpoint" },
  { name: "Pampang – SM Telabastagan", terminal: "Petron Angeles City" },
  { name: "Sapangbato – Angeles", terminal: "Pampang Road" },
  { name: "Friendship Highway – Angeles", terminal: "Friendship Highway" },
  { name: "Pandan – Angeles", terminal: "Marquee Mall Terminal" },
];

function LandingPage() {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const goToStart = () => navigate("/about-you");

  const scrollToId = (id) => (event) => {
    event.preventDefault();
    setIsMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    <main className="landing-page">
      <header className="landing-page__header">
        <a href="#top" className="landing-page__brand" onClick={scrollToId("top")}>
          <img src="/images/caiabe-squared.jpg" alt="" className="landing-page__brand-logo" />
          <span className="landing-page__brand-text">
            c<span className="landing-page__brand-ai">AI</span>abe
          </span>
        </a>

        <div className="landing-page__header-right">
          <nav className="landing-page__nav" aria-label="Page sections">
            <a href="#features" onClick={scrollToId("features")}>
              Features
            </a>
            <a href="#how-it-works" onClick={scrollToId("how-it-works")}>
              How it works
            </a>
          </nav>

          <div className="landing-page__menu-wrap">
            <button
              type="button"
              className="landing-page__menu-button"
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((open) => !open)}
            >
              {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            {isMenuOpen && (
              <div className="landing-page__menu" role="menu">
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

      <section id="top" className="landing-page__hero">
        <div className="landing-page__hero-content">
          <div className="landing-page__hero-text">
            <h1 className="landing-page__wordmark">
              c<span className="landing-page__wordmark-ai">AI</span>abe
            </h1>

            <p className="landing-page__tagline">Kumusta, Jo! Ready to find your ride?</p>
            <p className="landing-page__subtext">
              The AI-powered way to catch a jeepney in Angeles City &amp; Pampanga — know which
              line to take, where it is, and whether it has seats, before you even leave the
              house.
            </p>

            <button type="button" className="landing-page__start-button" onClick={goToStart}>
              Start journey
              <ArrowRight size={18} strokeWidth={2.5} />
            </button>
            <p className="landing-page__hero-note">No app download — works right in your browser.</p>

            <a
              href="sms:09472301496?body=ROUTE "
              className="landing-page__sms-teaser"
            >
              <MessageSquareText size={16} strokeWidth={2.5} />
              <span>
                No load or data? Text <strong>ROUTE</strong> to <strong>0947 230 1496</strong>
              </span>
            </a>
          </div>

          <MascotReveal className="landing-page__mascot" />
        </div>
      </section>

      <section id="features" className="landing-page__section">
        <p className="landing-page__eyebrow">Why cAIabe</p>
        <h2 className="landing-page__section-title">Everything you'd want to know before you walk out the door.</h2>

        <div className="landing-page__features">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="landing-page__feature-card">
              <span className="landing-page__feature-badge">
                <feature.icon size={14} strokeWidth={2.5} />
                {feature.tag}
              </span>

              <div className="landing-page__feature-image" aria-hidden="true">
                <feature.icon size={40} strokeWidth={1.5} />
              </div>

              <h3 className="landing-page__feature-title">{feature.title}</h3>
              <p className="landing-page__feature-body">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="landing-page__section landing-page__section--tinted">
        <div className="landing-page__section-inner">
          <p className="landing-page__eyebrow">How it works</p>
          <h2 className="landing-page__section-title">Three taps between you and your ride.</h2>
          <p className="landing-page__section-body">
            No account setup, no browsing a route map you don't recognize — just tell us where
            you're headed and let the AI do the rest.
          </p>

          <ol className="landing-page__steps">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step.title} className="landing-page__step">
                <span className="landing-page__step-number">{index + 1}</span>
                <div>
                  <h3 className="landing-page__step-title">{step.title}</h3>
                  <p className="landing-page__step-body">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <button type="button" className="landing-page__section-cta" onClick={goToStart}>
            Find my starting point
            <ArrowRight size={16} strokeWidth={2.5} />
          </button>
        </div>
      </section>

      <section className="landing-page__section">
        <p className="landing-page__eyebrow">Real routes, not guesses</p>
        <h2 className="landing-page__section-title">Mapped line-by-line for Angeles City &amp; Pampanga.</h2>

        <div className="landing-page__routes">
          {ROUTES_SAMPLE.map((route) => (
            <div key={route.name} className="landing-page__route-row">
              <span className="landing-page__route-name">{route.name}</span>
              <span className="landing-page__route-terminal">{route.terminal}</span>
            </div>
          ))}
        </div>
        <p className="landing-page__routes-note">
          …and more lines added as our coverage grows across the region.
        </p>
      </section>

      <section className="landing-page__closing">
        <h2 className="landing-page__closing-title">
          Nokarin ta munta, <span>Jo?</span>
        </h2>
        <p className="landing-page__closing-body">
          Tell us who's riding, and cAIabe will figure out the rest.
        </p>
        <button type="button" className="landing-page__closing-cta" onClick={goToStart}>
          Start journey
          <ArrowRight size={18} strokeWidth={2.5} />
        </button>
      </section>

      <footer className="landing-page__footer">
        <div className="landing-page__footer-brand">
          <span className="landing-page__footer-wordmark">
            c<span className="landing-page__wordmark-ai">AI</span>abe
          </span>
          <p className="landing-page__footer-tagline">
            Your AI co-pilot for jeepney rides in Angeles City &amp; Pampanga.
          </p>
        </div>

        <div className="landing-page__footer-links">
          <div className="landing-page__footer-column">
            <span className="landing-page__footer-heading">Ride</span>
            <a href="/about-you" onClick={(event) => { event.preventDefault(); goToStart(); }}>
              Start journey
            </a>
            <a href="#features" onClick={scrollToId("features")}>
              Features
            </a>
            <a href="#how-it-works" onClick={scrollToId("how-it-works")}>
              How it works
            </a>
          </div>
          <div className="landing-page__footer-column">
            <span className="landing-page__footer-heading">Drive with us</span>
            <a
              href="/driver/login"
              onClick={(event) => {
                event.preventDefault();
                navigate("/driver/login");
              }}
            >
              Driver log in
            </a>
            <a
              href="/driver/register"
              onClick={(event) => {
                event.preventDefault();
                navigate("/driver/register");
              }}
            >
              Apply as a driver
            </a>
          </div>
          <div className="landing-page__footer-column">
            <span className="landing-page__footer-heading">Support</span>
            <a href="mailto:support@caiabe.app">support@caiabe.app</a>
          </div>
        </div>

        <div className="landing-page__footer-bottom">
          <span>© 2026 cAIabe. Made for Angeles City &amp; Pampanga commuters.</span>
        </div>
      </footer>
    </main>
  );
}

export default LandingPage;
