import { useState } from "react";
import { whatsappGroupUrl, qrImagePath } from "../../../data/affiliate";

export default function JoinSection() {
  const [imgError, setImgError] = useState(false);

  return (
    <section
      id="join"
      className="join-section"
      style={{
        background: "linear-gradient(135deg, #f5f0e8 0%, #faf8f5 100%)",
        padding: "5rem 0",
      }}
    >
      <div className="container">
        <div
          className="join-card"
          style={{
            maxWidth: "900px",
            margin: "0 auto",
            background: "#ffffff",
            borderRadius: "24px",
            padding: "3rem",
            boxShadow: "0 20px 60px rgba(85, 69, 33, 0.1)",
            display: "flex",
            gap: "3rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div className="join-left" style={{ flex: 1, minWidth: "280px" }}>
            <h3
              style={{
                fontSize: "clamp(1.4rem, 3vw, 1.8rem)",
                color: "#554521",
                marginBottom: "1rem",
              }}
            >
              Gabung Sekarang, Gratis!
            </h3>
            <p
              style={{
                color: "#666",
                lineHeight: 1.8,
                marginBottom: "1.5rem",
              }}
            >
              Scan barcode di samping atau klik tombol di bawah untuk bergabung
              dengan grup WhatsApp komunitas affiliate Eglux. Tim admin kami akan
              membantu Anda memulai perjalanan affiliate Anda.
            </p>
            <ul
              style={{
                listStyle: "none",
                marginBottom: "2rem",
                padding: 0,
              }}
            >
              {[
                "Pendaftaran 100% gratis tanpa biaya",
                "Mendapatkan brief produk & aset promosi",
                "Support admin setiap hari kerja",
                "Komunitas affiliate yang aktif & supportif",
              ].map((item, i) => (
                <li
                  key={i}
                  style={{
                    color: "#666",
                    paddingLeft: "1.5rem",
                    position: "relative",
                    marginBottom: "0.6rem",
                    fontSize: "0.95rem",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      color: "#cba65a",
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <a
              href={whatsappGroupUrl}
              className="join-btn"
              target="_self"
              rel="noopener noreferrer"
              style={{
                display: "inline-block",
                padding: "1rem 2.5rem",
                background: "#cba65a",
                color: "#ffffff",
                textDecoration: "none",
                borderRadius: "30px",
                fontSize: "0.9rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "2px",
                transition: "all 0.3s ease",
                border: "none",
                cursor: "pointer",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#554521";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 10px 30px rgba(85, 69, 33, 0.2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#cba65a";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              Gabung Grup WhatsApp
            </a>
          </div>

          <div
            className="join-right"
            style={{
              textAlign: "center",
              flexShrink: 0,
              margin: "0 auto",
            }}
          >
            <div
              className="qr-placeholder"
              style={{
                width: "220px",
                height: "220px",
                background: "#faf8f5",
                borderRadius: "16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                border: "2px dashed #cba65a",
                marginBottom: "1rem",
                overflow: "hidden",
              }}
            >
              {!imgError ? (
                <img
                  src={qrImagePath}
                  alt="Barcode Grup WhatsApp Affiliate Eglux"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={() => setImgError(true)}
                />
              ) : (
                <>
                  <div style={{ fontSize: "3rem" }}>📱</div>
                  <div
                    style={{
                      marginTop: "0.5rem",
                      fontSize: "0.85rem",
                      color: "#666",
                    }}
                  >
                    Barcode WhatsApp
                  </div>
                </>
              )}
            </div>
            <p
              className="qr-label"
              style={{
                fontSize: "0.85rem",
                color: "#666",
                marginTop: "0.5rem",
              }}
            >
              Scan untuk bergabung
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}