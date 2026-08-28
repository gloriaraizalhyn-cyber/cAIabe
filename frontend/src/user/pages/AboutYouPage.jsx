import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PASSENGER_TYPES } from "../../shared/constants/passengerTypes.js";
import "./AboutYouPage.css";

function AboutYouPage() {
  const navigate = useNavigate();
  const [selectedPassengerType, setSelectedPassengerType] = useState(null);

  const handleSelectPassengerType = (passengerTypeValue) => {
    setSelectedPassengerType(passengerTypeValue);
  };

  const handleNextClick = () => {
    navigate("/routes", { state: { passengerType: selectedPassengerType } });
  };

  return (
    <main className="about-you-page">
      <h1 className="about-you-page__question">Tell us about yourself.</h1>
      <p className="about-you-page__prompt">I am a</p>

      <div className="about-you-page__options" role="radiogroup" aria-label="I am a">
        {PASSENGER_TYPES.map((passengerType) => (
          <button
            key={passengerType.value}
            type="button"
            role="radio"
            aria-checked={selectedPassengerType === passengerType.value}
            className={
              selectedPassengerType === passengerType.value
                ? "about-you-page__option about-you-page__option--selected"
                : "about-you-page__option"
            }
            onClick={() => handleSelectPassengerType(passengerType.value)}
          >
            {passengerType.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="about-you-page__next-button"
        disabled={!selectedPassengerType}
        onClick={handleNextClick}
      >
        Next
      </button>
    </main>
  );
}

export default AboutYouPage;
