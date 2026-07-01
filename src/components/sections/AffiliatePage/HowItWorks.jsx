import { steps } from "../../../data/affiliate";

export default function HowItWorks() {
  return (
    <section
      className="how-it-works"
      style={{
        background: "#ffffff",
        padding: "5rem 0",
      }}
    >
      <div className="container">
        <div className="section-header" style={{ textAlign: "center", marginBottom: "3rem" }}>
          <h2
            style={{
              fontSize: "2.2rem",
              fontWeight: 700,
              color: "#554521",
              marginBottom: "0.5rem",
            }}
          >
            Cara Kerja Program Affiliate
          </h2>
          <p style={{ color: "#666", fontSize: "1rem" }}>
            Empat langkah mudah untuk mulai menghasilkan
          </p>
        </div>

        <div
          className="steps-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "2rem",
            marginTop: "3rem",
          }}
        >
          {steps.map((step) => (
            <div
              key={step.number}
              className="step-card"
              style={{
                background: "#faf8f5",
                padding: "2.5rem 1.5rem",
                borderRadius: "20px",
                textAlign: "center",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-8px)";
                e.currentTarget.style.boxShadow =
                  "0 20px 40px rgba(0,0,0,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div
                className="step-number"
                style={{
                  width: "50px",
                  height: "50px",
                  background: "#cba65a",
                  color: "#ffffff",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  margin: "0 auto 1.5rem",
                }}
              >
                {step.number}
              </div>
              <h3
                style={{
                  fontSize: "1.1rem",
                  color: "#554521",
                  marginBottom: "0.8rem",
                }}
              >
                {step.title}
              </h3>
              <p
                style={{
                  color: "#666",
                  fontSize: "0.9rem",
                  lineHeight: 1.7,
                }}
              >
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}