import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "../components/TextField.jsx";
import CheckboxField from "../components/CheckboxField.jsx";
import { validateDriverLoginForm } from "../utils/validateDriverLoginForm.js";
import { supabase } from "../../shared/lib/supabaseClient.js";
import AuthLayout from "../../shared/components/AuthLayout.jsx";
import "./DriverLoginPage.css";

const INITIAL_FORM_VALUES = {
  emailOrMobileNumber: "",
  password: "",
  rememberMe: false,
};

function DriverLoginPage() {
  const navigate = useNavigate();
  const [formValues, setFormValues] = useState(INITIAL_FORM_VALUES);
  const [formErrors, setFormErrors] = useState({});
  const [submitStatus, setSubmitStatus] = useState("idle");
  const [submitErrorMessage, setSubmitErrorMessage] = useState(null);

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

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = validateDriverLoginForm(formValues);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});

    const identifier = formValues.emailOrMobileNumber.trim();
    if (!identifier.includes("@")) {
      setSubmitErrorMessage("Please log in with your email — mobile number login isn't available yet.");
      setSubmitStatus("error");
      return;
    }

    setSubmitStatus("submitting");
    const { error } = await supabase.auth.signInWithPassword({
      email: identifier,
      password: formValues.password,
    });

    if (error) {
      setSubmitErrorMessage(error.message);
      setSubmitStatus("error");
      return;
    }

    navigate("/driver/dashboard");
  };

  const handleForgotPassword = () => {};

  const handleApplyAsDriver = () => {
    navigate("/driver/register");
  };

  const isSubmitting = submitStatus === "submitting";

  return (
    <AuthLayout
      role="Driver portal"
      tagline="Your route, your queue and your riders, all in one dashboard."
      points={[
        "Track your place in the terminal queue",
        "Respond to rider requests in real time",
        "See where the demand is before you roll",
      ]}
      eyebrow="Driver"
      title="Welcome back"
      subtitle="Log in to access your driver dashboard."
      footer={
        <>
          New driver?{" "}
          <button type="button" className="auth-layout__link" onClick={handleApplyAsDriver}>
            Apply as a Driver
          </button>
        </>
      }
    >
      <form className="auth-layout__form" onSubmit={handleSubmit} noValidate>
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

        <div className="auth-layout__row">
          <CheckboxField
            label="Remember me"
            checked={formValues.rememberMe}
            onChange={(value) => handleFieldChange("rememberMe", value)}
          />
          <button type="button" className="auth-layout__link" onClick={handleForgotPassword}>
            Forgot password?
          </button>
        </div>

        {submitStatus === "error" && (
          <p className="auth-layout__error" role="alert">
            {submitErrorMessage ?? "Incorrect email/mobile number or password."}
          </p>
        )}

        <button type="submit" className="auth-layout__submit" disabled={isSubmitting}>
          {isSubmitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </AuthLayout>
  );
}

export default DriverLoginPage;
