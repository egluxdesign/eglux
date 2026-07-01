export default function CommissionSection() {
  return (
    <section
      className="commission-section"
      style={{
        background: "#ffffff",
        padding: "5rem 0",
      }}
    >
      <div className="container">
        <div
          className="commission-card"
          style={{
            maxWidth: "800px",
            margin: "0 auto",
            background: "linear-gradient(135deg, #554521 0%, #3d3218 100%)",
            borderRadius: "24px",
            padding: "3rem",
            textAlign: "center",
            color: "#ffffff",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Decorative circle */}
          <div
            style={{
              position: "absolute",
              top: "-50%",
              right: "-20%",
              width: "300px",
              height: "300px",
              background: "#cba65a",
              borderRadius: "50%",
              opacity: 0.1,
            }}
          />

          <h3
            style={{
              fontFamily:
                "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
              fontSize: "2rem",
              marginBottom: "0.5rem",
              position: "relative",
              zIndex: 1,
            }}
          >
            Komisi Affiliate
          </h3>
          <div
            className="commission-rate"
            style={{
              fontSize: "clamp(3rem, 8vw, 4rem)",
              fontWeight: 700,
              color: "#cba65a",
              lineHeight: 1,
              margin: "1rem 0",
              position: "relative",
              zIndex: 1,
            }}
          >
            10%
          </div>
          <p
            style={{
              color: "rgba(255,255,255,0.8)",
              fontSize: "1rem",
              lineHeight: 1.7,
              position: "relative",
              zIndex: 1,
            }}
          >
            Dari setiap penjualan yang berhasil melalui link affiliate Anda.
            Semakin banyak produk yang terjual, semakin besar penghasilan Anda.
            Komisi dibayarkan setiap minggu langsung ke rekening bank atau
            e-wallet pilihan Anda.
          </p>
        </div>
      </div>
    </section>
  );
}