import { ACCEPTED_DOCUMENT_PHOTO_TYPES } from "../../shared/constants/driverRegistrationFixtures.js";
import { EMAIL_PATTERN, PH_MOBILE_NUMBER_PATTERN } from "../../shared/utils/validationPatterns.js";

const PASSWORD_MIN_LENGTH = 8;

function isMissingFile(file) {
  return !file;
}

function hasInvalidFileType(file) {
  return file && !ACCEPTED_DOCUMENT_PHOTO_TYPES.includes(file.type);
}

// Pure frontend validation only — no backend/API calls. Returns a map of
// fieldName -> error message; a valid form returns an empty object.
export function validateDriverRegistrationForm(formValues) {
  const errors = {};

  if (!formValues.firstName.trim()) {
    errors.firstName = "First name is required.";
  }

  if (!formValues.lastName.trim()) {
    errors.lastName = "Last name is required.";
  }

  // Middle name is optional — no required/format check.

  const normalizedMobileNumber = formValues.mobileNumber.replace(/[\s-]/g, "");
  if (!normalizedMobileNumber) {
    errors.mobileNumber = "Mobile number is required.";
  } else if (!PH_MOBILE_NUMBER_PATTERN.test(normalizedMobileNumber)) {
    errors.mobileNumber = "Enter a valid mobile number (e.g. 09171234567).";
  }

  if (!formValues.emailAddress.trim()) {
    errors.emailAddress = "Email address is required.";
  } else if (!EMAIL_PATTERN.test(formValues.emailAddress.trim())) {
    errors.emailAddress = "Enter a valid email address.";
  }

  if (!formValues.password) {
    errors.password = "Password is required.";
  } else if (
    formValues.password.length < PASSWORD_MIN_LENGTH ||
    !/\d/.test(formValues.password)
  ) {
    errors.password = `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include a number.`;
  }

  if (!formValues.confirmPassword) {
    errors.confirmPassword = "Please confirm your password.";
  } else if (formValues.confirmPassword !== formValues.password) {
    errors.confirmPassword = "Passwords do not match.";
  }

  if (!formValues.driversLicenseNumber.trim()) {
    errors.driversLicenseNumber = "Driver's license number is required.";
  }

  if (isMissingFile(formValues.driversLicensePhotoFile)) {
    errors.driversLicensePhotoFile = "Upload a photo of your driver's license.";
  } else if (hasInvalidFileType(formValues.driversLicensePhotoFile)) {
    errors.driversLicensePhotoFile = "Only JPG or PNG files are accepted.";
  }

  if (!formValues.franchisePermitNumber.trim()) {
    errors.franchisePermitNumber = "Franchise/permit number is required.";
  }

  if (isMissingFile(formValues.franchisePermitPhotoFile)) {
    errors.franchisePermitPhotoFile = "Upload a photo of your franchise/permit.";
  } else if (hasInvalidFileType(formValues.franchisePermitPhotoFile)) {
    errors.franchisePermitPhotoFile = "Only JPG or PNG files are accepted.";
  }

  if (!formValues.plateNumber.trim()) {
    errors.plateNumber = "Plate number is required.";
  }

  if (!formValues.vehicleRegistrationNumber.trim()) {
    errors.vehicleRegistrationNumber = "Vehicle registration number is required.";
  }

  if (isMissingFile(formValues.vehicleRegistrationPhotoFile)) {
    errors.vehicleRegistrationPhotoFile = "Upload a photo of your vehicle registration.";
  } else if (hasInvalidFileType(formValues.vehicleRegistrationPhotoFile)) {
    errors.vehicleRegistrationPhotoFile = "Only JPG or PNG files are accepted.";
  }

  if (!formValues.jeepneyColor) {
    errors.jeepneyColor = "Select a jeepney color.";
  }

  if (!formValues.assignedRouteId) {
    errors.assignedRouteId = "Select your assigned route.";
  }

  if (!formValues.assignedTerminalId) {
    errors.assignedTerminalId = "Select your assigned terminal.";
  }

  return errors;
}
