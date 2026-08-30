import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "../../driver/components/TextField.jsx";
import { supabase } from "../../shared/lib/supabaseClient.js";
import "./AdminLoginPage.css";

const INITIAL_FORM_VALUES = { email: "", password: "" };

function AdminLoginPage() {
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
    if (submitStatus === "error") setSubmitStatus("idle");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const errors = {};
    if (!formValues.email.trim()) errors.email = "Email is required.";
    if (!formValues.password) errors.password = "Password is required.";
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormErrors({});
    setSubmitStatus("submitting");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: formValues.email.trim(),
      password: formValues.password,
    });

    if (error) {
      setSubmitErrorMessage(error.message);
      setSubmitStatus("error");
      return;
    }

    // Being a valid Supabase Auth user isn't enough — only accounts with a
    // row in `admins` (added by hand, no self-serve signup) should reach
    // the dashboard. The edge functions re-check this server-side too, so
    // this is just about not dropping a non-admin onto a broken screen.
    const { data: adminRow } = await supabase
      .from("admins")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!adminRow) {
      await supabase.auth.signOut();
      setSubmitErrorMessage("This account isn't set up as an admin.");
      setSubmitStatus("error");
      return;
    }

    navigate("/admin/dashboard");
  };

  const isSubmitting = submitStatus === "submitting";

  return (
    <main className="admin-login-page">
      <div className="admin-login-page__card">
        <header className="admin-login-page__header">
          <div className="admin-login-page__header-copy">
            <h1 className="admin-login-page__title">Admin Log In</h1>
            <p className="admin-login-page__subtitle">Review and approve driver applications.</p>
          </div>
          <img src="/images/caiabe-logo.png" alt="CAIABE" className="admin-login-page__logo" />
        </header>

        <form className="admin-login-page__form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Email"
            required
            type="email"
            value={formValues.email}
            onChange={(value) => handleFieldChange("email", value)}
            placeholder="you@example.com"
            autoComplete="username"
            error={formErrors.email}
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

          {submitStatus === "error" && (
            <p className="admin-login-page__submit-error">
              {submitErrorMessage ?? "Incorrect email or password."}
            </p>
          )}

          <button type="submit" className="admin-login-page__submit-button" disabled={isSubmitting}>
            {isSubmitting ? "Logging in…" : "Log In"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default AdminLoginPage;
