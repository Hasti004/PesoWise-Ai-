import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { MarketingShell, FullBleedBand, ScrollReveal } from '@/components/marketing';
import StaggerContainer, { StaggerItem } from '@/components/marketing/StaggerContainer';
import { LogoWall, Testimonials, CTASection } from '@/components/marketing/sections';
import { MockDashboardLarge, DemoMotionPanel } from '@/components/marketing/mocks';
import {
  ArrowRight,
  Eye,
  Clock,
  AlertTriangle,
  FileWarning,
  Zap,
  TrendingUp,
  Shield,
  FileText,
  CheckCircle,
  Users,
  BarChart
} from 'lucide-react';

const painPoints = [
  { icon: Eye, text: "No visibility on who spent what" },
  { icon: Clock, text: "Manual approvals & delays" },
  { icon: AlertTriangle, text: "Balance mismatches and errors" },
  { icon: FileWarning, text: "No audit trail or compliance" },
];

const howItWorksSteps = [
  {
    step: "1",
    title: "Submit Expense",
    description: "Employees submit expense reports with receipts in seconds",
    icon: FileText
  },
  {
    step: "2",
    title: "Verify & Review",
    description: "Engineers and managers verify expenses with full context",
    icon: CheckCircle
  },
  {
    step: "3",
    title: "Approve & Track",
    description: "Admin approves and balances update automatically",
    icon: Users
  },
  {
    step: "4",
    title: "Report & Audit",
    description: "Generate reports and maintain complete audit trails",
    icon: BarChart
  },
];

const whyPesoWise = [
  {
    icon: Zap,
    title: "Faster Approvals",
    description: "Streamlined workflow moves expenses from submission to approval in hours, not days."
  },
  {
    icon: TrendingUp,
    title: "Real-time Balances",
    description: "Always know exactly how much petty cash is available across all your locations."
  },
  {
    icon: Shield,
    title: "Audit-ready Records",
    description: "Every transaction is logged with timestamps, actors, and complete documentation."
  },
];

const HomePage = () => {
  return (
    <MarketingShell>
      {/* Hero Section */}
      <FullBleedBand variant="hero" className="py-20 md:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Left: Content */}
          <ScrollReveal variant="fade-up">
            <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl lg:text-6xl">
              Petty Cash & Expense Management —{' '}
              <span className="gradient-text">Simplified.</span>
            </h1>
            <p className="mb-4 text-lg text-muted-foreground md:text-xl">
              Track employee expenses, automate approvals, and control balances — all in one secure platform.
            </p>
            <p className="mb-8 text-sm text-muted-foreground">
              Built for modern teams • Secure • Multi-organization ready
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Button asChild size="lg" className="btn-glow group">
                <Link to="/contact">
                  Get Started Free
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Login</Link>
              </Button>
            </div>
          </ScrollReveal>

          {/* Right: Product Mock */}
          <ScrollReveal variant="fade-left" delay={0.2}>
            <div className="relative">
              <MockDashboardLarge />
              <div className="absolute -bottom-4 -right-4 w-64 md:w-72">
                <DemoMotionPanel />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </FullBleedBand>

      {/* Logo Wall */}
      <FullBleedBand variant="soft">
        <ScrollReveal variant="fade-up">
          <LogoWall />
        </ScrollReveal>
      </FullBleedBand>

      {/* Problem / Solution */}
      <FullBleedBand className="py-20">
        <ScrollReveal className="text-center mb-12">
          <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">
            Still managing petty cash on spreadsheets, WhatsApp, or emails?
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            You're not alone. Most teams struggle with manual expense tracking that leads to:
          </p>
        </ScrollReveal>

        <StaggerContainer className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {painPoints.map((point, index) => (
            <StaggerItem key={index}>
              <div className="flex items-center gap-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4 h-full">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                  <point.icon className="h-5 w-5 text-destructive" />
                </div>
                <span className="text-sm font-medium text-foreground">{point.text}</span>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </FullBleedBand>

      {/* How It Works Preview */}
      <FullBleedBand variant="soft" className="py-20">
        <ScrollReveal className="text-center mb-12">
          <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">
            How PesoWise Works
          </h2>
          <p className="text-muted-foreground">
            A simple, four-step process to streamline your expense management
          </p>
        </ScrollReveal>

        <StaggerContainer className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {howItWorksSteps.map((step, index) => (
            <StaggerItem key={index}>
              <div className="relative rounded-xl border border-border bg-card p-6 shadow-soft card-hover h-full">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <step.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="absolute -top-3 -left-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {step.step}
                </div>
                <h3 className="mb-2 text-base font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>

        <ScrollReveal delay={0.3}>
          <div className="mt-8 text-center">
            <Button asChild variant="outline">
              <Link to="/how-it-works">
                Learn more about the workflow
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </ScrollReveal>
      </FullBleedBand>

      {/* Why PesoWise */}
      <FullBleedBand className="py-20">
        <ScrollReveal className="text-center mb-12">
          <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">
            Why PesoWise?
          </h2>
          <p className="text-muted-foreground">
            Purpose-built for Philippine businesses managing petty cash
          </p>
        </ScrollReveal>

        <StaggerContainer className="grid gap-8 md:grid-cols-3">
          {whyPesoWise.map((item, index) => (
            <StaggerItem key={index}>
              <div className="rounded-xl border border-border bg-card p-8 shadow-soft card-hover text-center h-full">
                <div className="mb-6 mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <item.icon className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-3 text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </FullBleedBand>

      {/* Testimonials */}
      <FullBleedBand variant="soft">
        <ScrollReveal>
          <Testimonials />
        </ScrollReveal>
      </FullBleedBand>

      {/* CTA Section */}
      <FullBleedBand className="py-20">
        <ScrollReveal variant="scale">
          <CTASection />
        </ScrollReveal>
      </FullBleedBand>
    </MarketingShell>
  );
};

export default HomePage;
