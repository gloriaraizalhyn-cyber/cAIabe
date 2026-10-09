import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, Accessibility, UserRound, User, ArrowRight, Check } from "lucide-react";
import { PASSENGER_TYPES } from "../../shared/constants/passengerTypes.js";
import SiteHeader from "../components/SiteHeader.jsx";
import BackButton from "../../shared/components/BackButton.jsx";
import "./AboutYouPage.css";

const PASSENGER_TYPE_ICONS = {
  student: GraduationCap,
  pwd: Accessibility,
  senior_citizen: UserRound,
  regular: User,
};

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
      <SiteHeader />
      <BackButton to="/" className="about-you-page__back" />

      <div className="about-you-page__card">
        <h1 className="about-you-page__question">Tell us about yourself.</h1>
        <p className="about-you-page__prompt">
          Select what best describes you — this helps us apply the right fare.
        </p>

        <div className="about-you-page__options" role="radiogroup" aria-label="I am a">
          {PASSENGER_TYPES.map((passengerType) => {
            const Icon = PASSENGER_TYPE_ICONS[passengerType.value] ?? User;
            const isSelected = selectedPassengerType === passengerType.value;
            return (
              <button
                key={passengerType.value}
                type="button"
                role="radio"
                aria-checked={isSelected}
                data-type={passengerType.value}
                className={
                  isSelected
                    ? "about-you-page__option about-you-page__option--selected"
                    : "about-you-page__option"
                }
                onClick={() => handleSelectPassengerType(passengerType.value)}
              >
                {isSelected && (
                  <span className="about-you-page__option-check" aria-hidden="true">
                    <Check size={13} strokeWidth={3.25} />
                  </span>
                )}
                <span className="about-you-page__option-icon">
                  <Icon size={24} strokeWidth={2.25} />
                </span>
                {passengerType.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          className="about-you-page__next-button"
          disabled={!selectedPassengerType}
          onClick={handleNextClick}
        >
          Next
          <ArrowRight size={17} strokeWidth={2.5} />
        </button>
      </div>
    </main>
  );
}

export default AboutYouPage;


