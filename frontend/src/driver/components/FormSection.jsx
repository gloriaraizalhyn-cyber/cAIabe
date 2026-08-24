import "./FormSection.css";

function FormSection({ stepNumber, title, description, children }) {
  return (
    <section className="form-section">
      <div className="form-section__header">
        <span className="form-section__step-number">{stepNumber}</span>
        <div>
          <h2 className="form-section__title">{title}</h2>
          {description && <p className="form-section__description">{description}</p>}
        </div>
      </div>
      <div className="form-section__body">{children}</div>
    </section>
  );
}

export default FormSection;
