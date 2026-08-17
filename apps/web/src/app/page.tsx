import { Navbar } from "./components/marketing/Navbar";
import { FeatureSlider } from "./components/marketing/FeatureSlider";
import { Hero } from "./components/marketing/Hero";
import { WhoItsFor } from "./components/marketing/WhoItsFor";
import { TrustSignalsSection } from "./components/marketing/TrustSignalsSection";
import { HowItWorks } from "./components/marketing/HowItWorks";
import { TrustBanner } from "./components/marketing/TrustBanner";
import { Testimonials } from "./components/marketing/Testimonials";
import { Pricing } from "./components/marketing/Pricing";
import { Faq } from "./components/marketing/Faq";
import { Footer } from "./components/marketing/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main className="flex-1">
        <FeatureSlider />
        <Hero />
        <WhoItsFor />
        <TrustSignalsSection />
        <HowItWorks />
        <TrustBanner />
        <Testimonials />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
