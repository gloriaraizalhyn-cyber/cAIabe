import FormSection from "./FormSection.jsx";
import TextField from "./TextField.jsx";

function AccountInformationSection({ values, errors, onChange }) {
  return (
    <FormSection
      stepNumber={1}
      title="Account Information"
      description="Used to log in and to reach you about your application."
    >
      <TextField
        label="Full Name"
        required
        value={values.fullName}
        onChange={(value) => onChange("fullName", value)}
        placeholder="Juan Dela Cruz"
        autoComplete="name"
        error={errors.fullName}
      />
      <TextField
        label="Mobile Number"
        required
        type="tel"
        value={values.mobileNumber}
        onChange={(value) => onChange("mobileNumber", value)}
        placeholder="09171234567"
        autoComplete="tel"
        error={errors.mobileNumber}
      />
      <div className="form-section__field--full-width">
        <TextField
          label="Email Address"
          required
          type="email"
          value={values.emailAddress}
          onChange={(value) => onChange("emailAddress", value)}
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.emailAddress}
        />
      </div>
      <TextField
        label="Password"
        required
        type="password"
        value={values.password}
        onChange={(value) => onChange("password", value)}
        placeholder="At least 8 characters"
        autoComplete="new-password"
        error={errors.password}
      />
      <TextField
        label="Confirm Password"
        required
        type="password"
        value={values.confirmPassword}
        onChange={(value) => onChange("confirmPassword", value)}
        placeholder="Re-enter your password"
        autoComplete="new-password"
        error={errors.confirmPassword}
      />
    </FormSection>
  );
}

export default AccountInformationSection;
