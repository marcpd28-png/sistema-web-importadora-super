import { PublicStoreHeader } from "@/components/catalog/public-store-header";
import { StoreFooter } from "@/components/catalog/store-footer";

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <PublicStoreHeader />
      <main style={{ flex: 1, background: "#f8fafc", padding: "60px 20px" }}>
        <article style={{ 
          maxWidth: "800px", 
          margin: "0 auto", 
          background: "#ffffff", 
          padding: "48px", 
          borderRadius: "16px", 
          boxShadow: "0 10px 40px rgba(0,0,0,0.03)",
          fontFamily: "var(--font-body)",
          color: "#334155",
          lineHeight: 1.7
        }}>
          {children}
        </article>
      </main>
      <StoreFooter />
    </div>
  );
}
