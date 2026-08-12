import React, { useEffect } from 'react';
import LandingHeader from './components/LandingHeader';
import LandingHero from './components/LandingHero';
import { CapabilitiesSection, ProblemsSection, ProcessSection } from './components/LandingCoreSections';
import { AdvantagesSection, CasesSection, IndustriesSection, TeamSection } from './components/LandingTrustSections';
import LandingPricing from './components/LandingPricing';
import { FaqSection, FinalCtaSection, ServicesSection } from './components/LandingServicesFaq';
import LandingFooter from './components/LandingFooter';
import useLandingReveal from './hooks/useLandingReveal';
import './LandingPage.scss';

export default function LandingPage() {
  useLandingReveal();

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Бизнес Щит — управление репутацией бизнеса';
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
        <AdvantagesSection />
        <LandingPricing />
        <TeamSection />
        <CasesSection />
        <IndustriesSection />
        <ServicesSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
