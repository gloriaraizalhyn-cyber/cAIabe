import FormSection from "./FormSection.jsx";
import TextField from "./TextField.jsx";
import FileUploadField from "./FileUploadField.jsx";
import SelectField from "./SelectField.jsx";
import {
  ACCEPTED_DOCUMENT_PHOTO_TYPES_LABEL,
  JEEPNEY_COLOR_OPTIONS,
} from "../../shared/constants/driverRegistrationFixtures.js";

function VehicleInformationSection({ values, errors, onChange }) {
  return (
    <FormSection stepNumber={3} title="Jeepney / Vehicle Information">
      <TextField
        label="Plate Number"
        required
        value={values.plateNumber}
        onChange={(value) => onChange("plateNumber", value)}
        placeholder="ABC 1234"
        error={errors.plateNumber}
      />
      <TextField
        label="Vehicle Registration Number"
        required
        value={values.vehicleRegistrationNumber}
        onChange={(value) => onChange("vehicleRegistrationNumber", value)}
        placeholder="OR/CR number"
        error={errors.vehicleRegistrationNumber}
      />
      <FileUploadField
        label="Vehicle Registration Photo"
        required
        file={values.vehicleRegistrationPhotoFile}
        onFileSelect={(file) => onChange("vehicleRegistrationPhotoFile", file)}
        onRemove={() => onChange("vehicleRegistrationPhotoFile", null)}
        acceptedFileTypesLabel={ACCEPTED_DOCUMENT_PHOTO_TYPES_LABEL}
        accept="image/jpeg,image/png"
        error={errors.vehicleRegistrationPhotoFile}
      />
      <SelectField
        label="Jeepney Color"
        required
        value={values.jeepneyColor}
        onChange={(value) => onChange("jeepneyColor", value)}
        onClear={() => onChange("jeepneyColor", "")}
        options={JEEPNEY_COLOR_OPTIONS}
        placeholder="Select jeepney color"
        error={errors.jeepneyColor}
      />
    </FormSection>
  );
}

export default VehicleInformationSection;
