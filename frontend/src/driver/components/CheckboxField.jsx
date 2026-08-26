import { useId } from "react";
import "./CheckboxField.css";

function CheckboxField({ label, checked, onChange }) {
  const inputId = useId();

  return (
    <div className="checkbox-field">
      <input
        type="checkbox"
        id={inputId}
        className="checkbox-field__input"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label htmlFor={inputId} className="checkbox-field__label">
        {label}
      </label>
    </div>
  );
}

export default CheckboxField;
