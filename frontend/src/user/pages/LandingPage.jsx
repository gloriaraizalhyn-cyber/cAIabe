import { useNavigate } from "react-router-dom";
import "./LandingPage.css";

function LandingPage() {
  const navigate = useNavigate();

  const handleStartJourneyClick = () => {
    navigate("/about-you");
  };

  return (
    <main className="landing-page">
      <h1 className="landing-page__title">cAIabe</h1>
      <button
        type="button"
        className="landing-page__start-button"
        onClick={handleStartJourneyClick}
      >
        Start journey
      </button>
    </main>
  );
}

export default LandingPage;
