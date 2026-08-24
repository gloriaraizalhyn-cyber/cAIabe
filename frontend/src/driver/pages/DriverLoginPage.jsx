import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "../components/TextField.jsx";
import CheckboxField from "../components/CheckboxField.jsx";
import { validateDriverLoginForm } from "../utils/validateDriverLoginForm.js";
import "./DriverLoginPage.css";

const INITIAL_FORM_VALUES = {
  emailOrMobileNumber: "",
  password: "",
  rememberMe: false,
};

// No backend/auth yet, so a fixed demo password stands in for a real check —
// this is only here so the incorrect-password and success states are both
// reachable from the frontend.
const DEMO_VALID_PASSWORD = "password123";
const SIMULATED_NETWORK_DELAY_MS = 900;

function DriverLoginPage() {
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState(INITIAL_FORM_VALUES);
  const [formErrors, setFormErrors] = useState({});
  const [submitStatus, setSubmitStatus] = useState("idle");

  const handleFieldChange = (fieldName, value) => {
    setFormValues((previousValues) => ({ ...previousValues, [fieldName]: value }));
    setFormErrors((previousErrors) => {
      if (!previousErrors[fieldName]) return previousErrors;
      const { [fieldName]: _removed, ...remainingErrors } = previousErrors;
      return remainingErrors;
    });
    if (submitStatus === "error") {
      setSubmitStatus("idle");
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const errors = validateDriverLoginForm(formValues);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSubmitStatus("submitting");
    setTimeout(() => {
      if (formValues.password === DEMO_VALID_PASSWORD) {
        navigate("/driver/dashboard");
        return;
      }
      setSubmitStatus("error");
    }, SIMULATED_NETWORK_DELAY_MS);
  };

  const handleForgotPassword = () => {};

  const handleApplyAsDriver = () => {
    navigate("/driver/register");
  };

  const isSubmitting = submitStatus === "submitting";

  return (
    <main className="driver-login-page">
      <div className="driver-login-page__card">
        <header className="driver-login-page__header">
          <h1 className="driver-login-page__title">Driver Log In</h1>
          <p className="driver-login-page__subtitle">Log in to access your driver dashboard.</p>
        </header>

        <form className="driver-login-page__form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Email or Mobile Number"
            required
            type="text"
            value={formValues.emailOrMobileNumber}
            onChange={(value) => handleFieldChange("emailOrMobileNumber", value)}
            placeholder="you@example.com or 09171234567"
            autoComplete="username"
            error={formErrors.emailOrMobileNumber}
          />
          <TextField
            label="Password"
            required
            type="password"
            value={formValues.password}
            onChange={(value) => handleFieldChange("password", value)}
            placeholder="Enter your password"
            autoComplete="current-password"
            error={formErrors.password}
          />

          <div className="driver-login-page__row">
            <CheckboxField
              label="Remember Me"
              checked={formValues.rememberMe}
              onChange={(value) => handleFieldChange("rememberMe", value)}
            />
            <button
              type="button"
              className="driver-login-page__forgot-password-link"
              onClick={handleForgotPassword}
            >
              Forgot Password?
            </button>
          </div>

          {submitStatus === "error" && (
            <p className="driver-login-page__submit-error">
              Incorrect email/mobile number or password.
            </p>
          )}

          <button type="submit" className="driver-login-page__submit-button" disabled={isSubmitting}>
            {isSubmitting ? "Logging in…" : "Log In"}
          </button>
        </form>

        <p className="driver-login-page__apply-notice">
          New driver?{" "}
          <button type="button" className="driver-login-page__apply-link" onClick={handleApplyAsDriver}>
            Apply as a Driver
          </button>
        </p>
      </div>
    </main>
  );
}

export default DriverLoginPage;
