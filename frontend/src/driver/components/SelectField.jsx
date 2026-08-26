import { X } from "lucide-react";
import "./SelectField.css";

function SelectField({
  label,
  required = false,
  value,
  onChange,
  onClear,
  options,
  placeholder,
  disabled = false,
  disabledPlaceholder,
  error,
}) {
  const currentPlaceholder = disabled && disabledPlaceholder ? disabledPlaceholder : placeholder;

  return (
    <div className="select-field">
      <label className="select-field__label">
        {label}
        {required && <span className="select-field__required-mark">*</span>}
      </label>
      <div className="select-field__control">
        <select
          className={error ? "select-field__select select-field__select--error" : "select-field__select"}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{currentPlaceholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {value && !disabled && (
          <button
            type="button"
            className="select-field__clear-button"
            onClick={onClear}
            aria-label={`Clear ${label}`}
          >
            <X size={14} strokeWidth={2.25} />
          </button>
        )}
      </div>
      {error && <p className="select-field__error">{error}</p>}
    </div>
  );
}

export default SelectField;
