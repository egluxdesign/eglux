import { whatsappGroupUrl } from "../../../data/affiliate";

export default function AffiliateHero() {
  return (
    <section
      className="affiliate-hero"
      style={{
        background: "linear-gradient(135deg, #554521 0%, #3d3218 100%)",
        padding: "6rem 0",
        textAlign: "center",
        color: "#ffffff",
      }}
    >
      <div className="container">
        <h2
          style={{
            fontFamily:
              "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
            fontSize: "clamp(2rem, 5vw, 2.8rem)",
            fontWeight: 700,
            marginBottom: "1rem",
            letterSpacing: "1px",
          }}
        >
          Program Affiliate Eglux
        </h2>
        <p
          style={{
            fontSize: "1.1rem",
            color: "rgba(255,255,255,0.85)",
            maxWidth: "600px",
            margin: "0 auto 2rem",
            lineHeight: 1.8,
          }}
        >
          Bergabunglah dengan ribuan affiliate Eglux yang telah menghasilkan
          penghasilan tambahan setiap bulan. Promosikan produk berkualitas dan
          dapatkan komisi menarik dari setiap penjualan yang berhasil.
        </p>
        <a
          href={whatsappGroupUrl}
          className="shop-btn"
          target="_self"
          rel="noopener noreferrer"
        >
          Join Grup Affiliate
        </a>
      </div>
    </section>
  );
}