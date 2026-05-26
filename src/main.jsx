import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Home,
  QrCode,
  Gift,
  User,
  Bell,
  Coffee,
  Star,
} from "lucide-react";
import "./style.css";

function App() {
  const [activeTab, setActiveTab] = useState("home");

  return (
    <div
      style={{
        background: "#060606",
        minHeight: "100vh",
        color: "white",
        fontFamily: "Inter, sans-serif",
        paddingBottom: "90px",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          padding: "24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1
            style={{
              fontSize: "28px",
              fontWeight: "800",
              letterSpacing: "2px",
            }}
          >
            LİBERTE
          </h1>

          <p
            style={{
              color: "#888",
              marginTop: "-10px",
            }}
          >
            Premium Gastro Cafe
          </p>
        </div>

        <div
          style={{
            width: "46px",
            height: "46px",
            borderRadius: "50%",
            background: "#111",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid #222",
          }}
        >
          <Bell size={20} />
        </div>
      </div>

      {/* HERO */}
      <div
        style={{
          margin: "0 20px",
          background:
            "linear-gradient(135deg,#101010,#1b1b1b,#0f0f0f)",
          borderRadius: "28px",
          padding: "24px",
          border: "1px solid #1f1f1f",
          boxShadow: "0 0 30px rgba(255,255,255,0.03)",
        }}
      >
        <div
          style={{
            color: "#b89550",
            fontWeight: "700",
            marginBottom: "12px",
          }}
        >
          LIBERTE CLUB
        </div>

        <h2
          style={{
            fontSize: "30px",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Sadakat Programı
        </h2>

        <p
          style={{
            color: "#9f9f9f",
            marginTop: "12px",
            lineHeight: 1.5,
          }}
        >
          Kahve iç, puan kazan, ödülleri topla.
        </p>

        <button
          style={{
            marginTop: "18px",
            background: "#b89550",
            color: "black",
            border: "none",
            padding: "14px 20px",
            borderRadius: "16px",
            fontWeight: "700",
            cursor: "pointer",
          }}
        >
          QR Kartımı Aç
        </button>
      </div>

      {/* STATS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "14px",
          padding: "20px",
        }}
      >
        <Card
          title="Toplam Puan"
          value="245"
          icon={<Star size={20} />}
        />

        <Card
          title="Bedava Kahve"
          value="2"
          icon={<Coffee size={20} />}
        />
      </div>

      {/* KAMPANYALAR */}
      <div style={{ padding: "0 20px" }}>
        <h3
          style={{
            marginBottom: "16px",
            fontSize: "22px",
          }}
        >
          Kampanyalar
        </h3>

        <CampaignCard
          title="1 Alana 1 Bedava"
          desc="Smash Burger menülerde geçerli."
        />

        <CampaignCard
          title="%20 İndirim"
          desc="Tatlı + Kahve kombinlerinde."
        />
      </div>

      {/* BOTTOM MENU */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "#0d0d0d",
          borderTop: "1px solid #1c1c1c",
          display: "flex",
          justifyContent: "space-around",
          padding: "14px 0",
        }}
      >
        <NavItem
          icon={<Home />}
          label="Ana Sayfa"
          active={activeTab === "home"}
          onClick={() => setActiveTab("home")}
        />

        <NavItem
          icon={<QrCode />}
          label="QR"
          active={activeTab === "qr"}
          onClick={() => setActiveTab("qr")}
        />

        <NavItem
          icon={<Gift />}
          label="Ödüller"
          active={activeTab === "gift"}
          onClick={() => setActiveTab("gift")}
        />

        <NavItem
          icon={<User />}
          label="Profil"
          active={activeTab === "profile"}
          onClick={() => setActiveTab("profile")}
        />
      </div>
    </div>
  );
}

function Card({ title, value, icon }) {
  return (
    <div
      style={{
        background: "#101010",
        borderRadius: "22px",
        padding: "20px",
        border: "1px solid #1c1c1c",
      }}
    >
      <div
        style={{
          color: "#b89550",
          marginBottom: "14px",
        }}
      >
        {icon}
      </div>

      <div
        style={{
          color: "#888",
          fontSize: "14px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: "30px",
          fontWeight: "800",
          marginTop: "8px",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function CampaignCard({ title, desc }) {
  return (
    <div
      style={{
        background: "#111",
        borderRadius: "22px",
        padding: "20px",
        marginBottom: "14px",
        border: "1px solid #1d1d1d",
      }}
    >
      <div
        style={{
          fontWeight: "700",
          fontSize: "18px",
        }}
      >
        {title}
      </div>

      <div
        style={{
          color: "#999",
          marginTop: "8px",
        }}
      >
        {desc}
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        color: active ? "#b89550" : "#666",
        cursor: "pointer",
        fontSize: "12px",
      }}
    >
      {icon}
      <span style={{ marginTop: "6px" }}>{label}</span>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
