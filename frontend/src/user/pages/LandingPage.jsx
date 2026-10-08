import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  MessageSquareText,
  Menu,
  X,
} from "lucide-react";
import "./LandingPage.css";

const FEATURES = [
  {
    title: "Track live jeeps",
    description:
      "See your jeepney move on the map in real time, and check if there's room to sit before it arrives.",
    image: "/images/banner_tracking.png",
    alt: "A jeepney approaching on a map with an 'Arriving in 2 min' bubble",
  },
  {
    title: "Know which line to take",
    description:
      "cAIabe matches your trip to a real jeepney line across Angeles City & Pampanga, with the right fare for you.",
    image: "/images/banner_route.png",
    alt: "A jeepney route winding across a city map",
  },
  {
    title: "Just ask cAIabe",
    description:
      "Type or speak where you're headed — the AI answers in plain language and explains why it's the best pick.",
    image: "/images/banner_chatbot.png",
    alt: "The cAIabe chatbot answering a commuter's question",
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
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);

  // Arriving from another page's header link: scroll to the requested section.
  useEffect(() => {
    const id = location.state?.scrollTo;
    if (!id) return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "start" });
      // clear the request through the router so a refresh does not repeat it
      navigate(location.pathname, { replace: true, state: null });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [location.state, location.pathname, navigate]);

  // Hide the header while scrolling down; show it at the top and on scroll up.
  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      const delta = y - lastY;
      if (y <= 8) {
        setIsHeaderHidden(false);
        lastY = y;
      } else if (delta > 6) {
        setIsHeaderHidden(true);
        lastY = y;
      } else if (delta < -6) {
        setIsHeaderHidden(false);
        lastY = y;
      }
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
      <header
        className={`landing-page__header${
          isHeaderHidden && !isMenuOpen ? " landing-page__header--hidden" : ""
        }`}
      >
        <a href="#top" className="landing-page__brand" onClick={scrollToId("top")}>
          <img src="/images/caiabe-squared.jpg" alt="" className="landing-page__brand-logo" />
          <span className="landing-page__brand-text">
            c<span className="landing-page__brand-ai">AI</span>abe
          </span>
        </a>

        <div className="landing-page__header-right">
          <nav className="landing-page__nav" aria-label="Page sections">
            <a href="#top" onClick={scrollToId("top")}>
              Home
            </a>
            <a href="#features" onClick={scrollToId("features")}>
              Features
            </a>
            <a href="#how-it-works" onClick={scrollToId("how-it-works")}>
              How it works
            </a>
            <a href="#routes" onClick={scrollToId("routes")}>
              Routes
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
                <button type="button" role="menuitem" className="landing-page__menu-link" onClick={scrollToId("top")}>
                  Home
                </button>
                <button type="button" role="menuitem" className="landing-page__menu-link" onClick={scrollToId("features")}>
                  Features
                </button>
                <button type="button" role="menuitem" className="landing-page__menu-link" onClick={scrollToId("how-it-works")}>
                  How it works
                </button>
                <button type="button" role="menuitem" className="landing-page__menu-link" onClick={scrollToId("routes")}>
                  Routes
                </button>
                <span className="landing-page__menu-divider" aria-hidden="true" />
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

            <p className="landing-page__tagline">Ready to find your ride?</p>
            <p className="landing-page__subtext">
              The AI-powered way to catch a jeepney — know which line to take, where it is, and
              whether it has seats, before you even leave the house.
            </p>

            <button type="button" className="landing-page__start-button" onClick={goToStart}>
              Start journey
              <ArrowRight size={18} strokeWidth={2.5} />
            </button>

            <a
              href="sms:09472301496?body=ROUTE "
              className="landing-page__sms-teaser"
            >
              <MessageSquareText size={16} strokeWidth={2.5} />
              <span>
                No load or data? Text<br />
                <strong>ROUTE</strong> to <strong>0947 230 1496</strong>
              </span>
            </a>
          </div>

          <div className="landing-page__poster-wrap">
            <img
              src="/images/banner_landingPagePoster.png"
              alt="The cAIabe app on a phone showing the next jeepney two minutes away, beside a colorful Angeles City jeepney"
              className="landing-page__poster"
            />
            <ul className="landing-page__poster-pills">
              <li className="landing-page__poster-pill landing-page__poster-pill--a">No app download</li>
              <li className="landing-page__poster-pill landing-page__poster-pill--b">Live tracking</li>
              <li className="landing-page__poster-pill landing-page__poster-pill--c">Seat status</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="features" className="landing-page__section">
        <div className="landing-page__features-head">
          <p className="landing-page__eyebrow">Why cAIabe</p>
          <h2 className="landing-page__section-title">Everything you'd want to know before you walk out the door.</h2>
        </div>

        <div className="landing-page__features">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="landing-page__feature-card">
              <div className="landing-page__feature-top">
                <div className="landing-page__feature-copy">
                  <h3 className="landing-page__feature-title">{feature.title}</h3>
                  <p className="landing-page__feature-body">{feature.description}</p>
                </div>
              </div>

              <div className="landing-page__feature-image">
                <img src={feature.image} alt={feature.alt} loading="lazy" />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="landing-page__section landing-page__section--tinted">
        <div className="landing-page__section-inner">
          <div className="landing-page__how-head">
            <p className="landing-page__eyebrow">How it works</p>
            <h2 className="landing-page__section-title">Three taps between you and your ride.</h2>
          </div>

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

      <section id="routes" className="landing-page__section">
        <div className="landing-page__routes-panel">
          <h2 className="landing-page__section-title landing-page__routes-title">Mapped line-by-line for Angeles City and Pampanga.</h2>

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
        </div>
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
        <div className="landing-page__footer-card">
          <div className="landing-page__footer-main">
            <div className="landing-page__footer-brand">
              <div className="landing-page__footer-logo">
                <img
                  src="/images/caiabe-squared.jpg"
                  alt=""
                  className="landing-page__footer-logo-img"
                />
                <span className="landing-page__footer-wordmark">
                  c<span className="landing-page__wordmark-ai">AI</span>abe
                </span>
              </div>
            </div>

            <nav className="landing-page__footer-links" aria-label="Footer">
              <div className="landing-page__footer-column">
                <span className="landing-page__footer-heading">Explore</span>
                <a href="#top" onClick={scrollToId("top")}>
                  Home
                </a>
                <a href="#features" onClick={scrollToId("features")}>
                  Features
                </a>
                <a href="#how-it-works" onClick={scrollToId("how-it-works")}>
                  How it works
                </a>
                <a href="#routes" onClick={scrollToId("routes")}>
                  Routes
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
    </main>
  );
}

export default LandingPage;
