import FormSection from "./FormSection.jsx";
import TextField from "./TextField.jsx";

// Trims accidental leading/trailing whitespace (e.g. a stray space left
// over from autocomplete or a fumbled keystroke) once the driver leaves
// the field, rather than while they're still typing.
function trimNameFieldOnBlur(fieldName, currentValue, onChange) {
  const trimmedValue = currentValue.trim();
  if (trimmedValue !== currentValue) {
    onChange(fieldName, trimmedValue);
  }
}

function AccountInformationSection({ values, errors, onChange }) {
  return (
    <FormSection
      stepNumber={1}
      title="Account Information"
      description="Used to log in and to reach you about your application."
    >
      <TextField
        label="First Name"
        required
        value={values.firstName}
        onChange={(value) => onChange("firstName", value)}
        onBlur={() => trimNameFieldOnBlur("firstName", values.firstName, onChange)}
        placeholder="Juan"
        autoComplete="given-name"
        error={errors.firstName}
      />
      <TextField
        label="Last Name"
        required
        value={values.lastName}
        onChange={(value) => onChange("lastName", value)}
        onBlur={() => trimNameFieldOnBlur("lastName", values.lastName, onChange)}
        placeholder="Dela Cruz"
        autoComplete="family-name"
        error={errors.lastName}
      />
      <TextField
        label="Middle Name"
        value={values.middleName}
        onChange={(value) => onChange("middleName", value)}
        onBlur={() => trimNameFieldOnBlur("middleName", values.middleName, onChange)}
        placeholder="Santos (optional)"
        autoComplete="additional-name"
        error={errors.middleName}
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
