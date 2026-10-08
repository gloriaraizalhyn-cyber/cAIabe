import { useState } from "react";
import { useNavigate } from "react-router-dom";
import TextField from "../../driver/components/TextField.jsx";
import AuthLayout from "../../shared/components/AuthLayout.jsx";
import { supabase } from "../../shared/lib/supabaseClient.js";

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
    <AuthLayout
      role="Admin console"
      tagline="Keep the road network trusted, one driver at a time."
      points={[
        "Review and approve driver applications",
        "Verify documents and vehicle details",
        "Manage active drivers across routes",
      ]}
      eyebrow="Admin"
      title="Admin log in"
      subtitle="Authorized staff only. Sign in to review driver applications."
    >
      <form className="auth-layout__form" onSubmit={handleSubmit} noValidate>
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
          <p className="auth-layout__error" role="alert">
            {submitErrorMessage ?? "Incorrect email or password."}
          </p>
        )}

        <button type="submit" className="auth-layout__submit" disabled={isSubmitting}>
          {isSubmitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </AuthLayout>
  );
}

export default AdminLoginPage;
