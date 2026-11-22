import Footer from "@/components/layout/Footer";
import Navbar from "@/components/layout/Navbar";

// Static on purpose: marketing pages are cached at the edge. Signed-in users are sent to the dashboard by /login.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
