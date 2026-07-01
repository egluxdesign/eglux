import { benefits } from "../../../data/affiliate";

export default function BenefitsSection() {
  return (
    <section
      className="benefits-section"
      style={{
        background: "#faf8f5",
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
            Keuntungan Menjadi Affiliate
          </h2>
          <p style={{ color: "#666", fontSize: "1rem" }}>
            Berbagai benefit eksklusif yang menanti Anda
          </p>
        </div>

        <div
          className="benefits-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: "2rem",
            marginTop: "3rem",
          }}
        >
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="benefit-card"
              style={{
                background: "#ffffff",
                padding: "2.5rem",
                borderRadius: "20px",
                textAlign: "center",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-5px)";
                e.currentTarget.style.boxShadow =
                  "0 15px 35px rgba(0,0,0,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div
                className="benefit-icon"
                style={{
                  width: "70px",
                  height: "70px",
                  background: "#f5f0e8",
                  borderRadius: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 1.5rem",
                  fontSize: "1.8rem",
                }}
              >
                {benefit.icon}
              </div>
              <h3
                style={{
                  fontSize: "1.2rem",
                  marginBottom: "0.8rem",
                  color: "#554521",
                }}
              >
                {benefit.title}
              </h3>
              <p
                style={{
                  color: "#666",
                  fontSize: "0.95rem",
                  lineHeight: 1.7,
                }}
              >
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}