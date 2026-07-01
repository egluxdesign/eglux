import { useState } from "react";
import { faqs } from "../../../data/affiliate";

export default function FAQSection() {
  const [activeIndex, setActiveIndex] = useState(null);

  const toggleFAQ = (index) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <section
      className="faq-section"
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
            FAQ
          </h2>
          <p style={{ color: "#666", fontSize: "1rem" }}>
            Temukan jawaban untuk pertanyaan umum seputar program affiliate
          </p>
        </div>

        <div
          className="faq-grid"
          style={{ maxWidth: "800px", margin: "0 auto" }}
        >
          {faqs.map((faq, index) => {
            const isActive = activeIndex === index;
            return (
              <div
                key={index}
                className={`faq-item ${isActive ? "active" : ""}`}
                style={{
                  borderBottom: "1px solid #eee",
                  padding: "1.5rem 0",
                }}
              >
                <div
                  className="faq-question"
                  onClick={() => toggleFAQ(index)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    cursor: "pointer",
                    fontWeight: 600,
                    color: "#554521",
                    fontSize: "1.05rem",
                  }}
                >
                  <span>{faq.question}</span>
                  <span
                    className="faq-icon"
                    style={{
                      fontSize: "1.5rem",
                      color: "#cba65a",
                      transition: "transform 0.3s ease",
                      transform: isActive ? "rotate(45deg)" : "rotate(0deg)",
                    }}
                  >
                    +
                  </span>
                </div>
                <div
                  className="faq-answer"
                  style={{
                    maxHeight: isActive ? "200px" : "0",
                    overflow: "hidden",
                    transition: "all 0.3s ease",
                    color: "#666",
                    lineHeight: 1.8,
                    paddingTop: isActive ? "1rem" : "0",
                  }}
                >
                  {faq.answer}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}