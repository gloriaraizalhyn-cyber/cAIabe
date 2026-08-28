import { EMAIL_PATTERN, PH_MOBILE_NUMBER_PATTERN } from "../../shared/utils/validationPatterns.js";

// Pure frontend validation only — no backend/API calls. Returns a map of
// fieldName -> error message; a valid form returns an empty object.
export function validateDriverLoginForm(formValues) {
  const errors = {};

  const identifier = formValues.emailOrMobileNumber.trim();
  if (!identifier) {
    errors.emailOrMobileNumber = "Enter your email or mobile number.";
  } else {
    const normalizedIdentifier = identifier.replace(/[\s-]/g, "");
    const isValidEmail = EMAIL_PATTERN.test(identifier);
    const isValidMobileNumber = PH_MOBILE_NUMBER_PATTERN.test(normalizedIdentifier);
    if (!isValidEmail && !isValidMobileNumber) {
      errors.emailOrMobileNumber = "Enter a valid email address or mobile number.";
    }
  }

  if (!formValues.password) {
    errors.password = "Password is required.";
  }

  return errors;
}
