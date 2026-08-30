import { useState } from "react";
import { X } from "lucide-react";
import TextField from "../../driver/components/TextField.jsx";
import SelectField from "../../driver/components/SelectField.jsx";
import { JEEPNEY_COLOR_OPTIONS } from "../../shared/constants/driverRegistrationFixtures.js";
import "./DriverEditModal.css";

const VEHICLE_TYPE_OPTIONS = [
  { value: "jeepney", label: "Jeepney" },
  { value: "tricycle", label: "Tricycle" },
];

function DriverEditModal({ driver, routes, terminals, onSave, onCancel, isSaving }) {
  const [formValues, setFormValues] = useState({
    fullName: driver.fullName ?? "",
    mobileNumber: driver.mobileNumber ?? "",
    plateNumber: driver.plateNumber ?? "",
    vehicleRegistrationNumber: driver.vehicleRegistrationNumber ?? "",
    jeepColor: driver.jeepColor?.toLowerCase() ?? "",
    vehicleType: driver.vehicleType ?? "",
    routeId: driver.route?.id ?? "",
    terminalId: driver.terminal?.id ?? "",
  });

  const setField = (field) => (value) =>
    setFormValues((current) => ({ ...current, [field]: value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave({
      full_name: formValues.fullName.trim(),
      mobile_number: formValues.mobileNumber.trim(),
      plate_number: formValues.plateNumber.trim(),
      vehicle_registration_number: formValues.vehicleRegistrationNumber.trim(),
      jeep_color: formValues.jeepColor,
      vehicle_type: formValues.vehicleType,
      route_id: formValues.routeId || null,
      home_terminal_id: formValues.terminalId || null,
    });
  };

  return (
    <div className="driver-edit-modal__backdrop">
      <div className="driver-edit-modal" role="dialog" aria-modal="true">
        <header className="driver-edit-modal__header">
          <h2 className="driver-edit-modal__title">Edit Driver</h2>
          <button
            type="button"
            className="driver-edit-modal__close-button"
            onClick={onCancel}
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.25} />
          </button>
        </header>

        <form className="driver-edit-modal__form" onSubmit={handleSubmit}>
          <TextField
            label="Full name"
            value={formValues.fullName}
            onChange={setField("fullName")}
            placeholder="Juan Dela Cruz"
          />
          <TextField
            label="Mobile number"
            value={formValues.mobileNumber}
            onChange={setField("mobileNumber")}
            placeholder="09171234567"
          />
          <TextField
            label="Plate number"
            value={formValues.plateNumber}
            onChange={setField("plateNumber")}
            placeholder="ABC 1234"
          />
          <TextField
            label="Vehicle registration"
            value={formValues.vehicleRegistrationNumber}
            onChange={setField("vehicleRegistrationNumber")}
            placeholder="Vehicle registration number"
          />
          <SelectField
            label="Jeep color"
            value={formValues.jeepColor}
            onChange={setField("jeepColor")}
            onClear={() => setField("jeepColor")("")}
            options={JEEPNEY_COLOR_OPTIONS}
            placeholder="Select jeep color"
          />
          <SelectField
            label="Vehicle type"
            value={formValues.vehicleType}
            onChange={setField("vehicleType")}
            onClear={() => setField("vehicleType")("")}
            options={VEHICLE_TYPE_OPTIONS}
            placeholder="Select vehicle type"
          />
          <SelectField
            label="Route"
            value={formValues.routeId}
            onChange={setField("routeId")}
            onClear={() => setField("routeId")("")}
            options={routes.map((route) => ({ value: route.id, label: route.name }))}
            placeholder="Select route"
          />
          <SelectField
            label="Terminal"
            value={formValues.terminalId}
            onChange={setField("terminalId")}
            onClear={() => setField("terminalId")("")}
            options={terminals.map((terminal) => ({ value: terminal.id, label: terminal.name }))}
            placeholder="Select terminal"
          />

          <div className="driver-edit-modal__actions">
            <button
              type="button"
              className="driver-edit-modal__cancel-button"
              onClick={onCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button type="submit" className="driver-edit-modal__save-button" disabled={isSaving}>
              {isSaving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DriverEditModal;
