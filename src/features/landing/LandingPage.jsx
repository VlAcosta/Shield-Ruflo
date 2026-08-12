import React, { useEffect } from 'react';
import LandingHeader from './components/LandingHeader';
import LandingHero from './components/LandingHero';
import { CapabilitiesSection, ProblemsSection, ProcessSection } from './components/LandingCoreSections';
import { MarketFocusSection, OutcomeMetricsSection, ProductTruthSection } from './components/LandingStrategySections';
import LandingPricing from './components/LandingPricing';
import { FaqSection, FinalCtaSection, ServicesSection } from './components/LandingServicesFaq';
import LandingFooter from './components/LandingFooter';
import useLandingReveal from './hooks/useLandingReveal';
import './LandingPage.scss';

export default function LandingPage() {
  useLandingReveal();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Бизнес Щит — Reputation Operations System';
    return () => { document.title = previousTitle; };
  }, []);

  return (
    <div className="landing-page">
      <LandingHeader />
      <main>
        <LandingHero />
        <ProblemsSection />
        <ProcessSection />
        <CapabilitiesSection />
        <ProductTruthSection />
        <MarketFocusSection />
        <OutcomeMetricsSection />
        <LandingPricing />
        <ServicesSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
