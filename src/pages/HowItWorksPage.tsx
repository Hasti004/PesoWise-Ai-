import { MarketingShell, FullBleedBand, ScrollReveal } from "@/components/marketing";
import StaggerContainer, { StaggerItem } from "@/components/marketing/StaggerContainer";
import { CTASection, FAQAccordion } from "@/components/marketing/sections";
import { WorkflowIllustration, WorkflowLivePanel } from "@/components/marketing/how-it-works";
import {
  FileText,
  Search,
  ThumbsUp,
  Wallet,
  ClipboardCheck,
  User,
  Wrench,
  Shield,
  Coins,
  CheckCircle2,
} from "lucide-react";
import type { FAQItem } from "@/components/marketing/sections";

/* Workflow steps */
const workflowSteps = [
  {
    label: "Submit",
    description: "Employee creates expense report with details and receipts",
    icon: FileText,
    color: "bg-primary text-primary-foreground",
  },
  {
    label: "Verify",
    description: "Engineer reviews and verifies on-site (optional)",
    icon: Search,
    color: "bg-warning text-warning-foreground",
  },
  {
    label: "Approve",
    description: "Admin provides final approval with full context",
    icon: ThumbsUp,
    color: "bg-accent text-accent-foreground",
  },
  {
    label: "Balance Update",
    description: "Petty cash balance deducted automatically",
    icon: Wallet,
    color: "bg-info text-info-foreground",
  },
  {
    label: "Audit",
    description: "Complete trail logged for compliance",
    icon: ClipboardCheck,
    color: "bg-primary text-primary-foreground",
  },
];

/* Role snapshots */
const roles = [
  {
    role: "Employee",
    icon: User,
    color: "bg-primary/10 text-primary",
    responsibilities: [
      "Create and submit expense reports",
      "Upload receipts and documentation",
      "Track expense status in real-time",
    ],
    mockAction: "Submit Expense Report",
  },
  {
    role: "Engineer",
    icon: Wrench,
    color: "bg-warning/10 text-warning",
    responsibilities: [
      "Verify expenses on-site when required",
      "Add verification notes and comments",
      "Forward verified expenses for approval",
    ],
    mockAction: "Verify & Forward",
  },
  {
    role: "Admin",
    icon: Shield,
    color: "bg-accent/10 text-accent",
    responsibilities: [
      "Final approval with complete visibility",
      "Manage approval limits and thresholds",
      "Access comprehensive reports and exports",
    ],
    mockAction: "Approve Expense",
  },
  {
    role: "Cashier",
    icon: Coins,
    color: "bg-info/10 text-info",
    responsibilities: [
      "Manage petty cash balances",
      "Process fund additions and transfers",
      "Handle return requests",
    ],
    mockAction: "Add Funds",
  },
];

const workflowFaqItems: FAQItem[] = [
  {
    question: "Is engineer verification always required?",
    answer:
      "No, engineer verification is optional and can be configured based on your organization's needs. Some expense types may require verification while others can go directly to admin approval.",
  },
  {
    question: "What happens if an expense is rejected?",
    answer:
      "Rejected expenses are returned to the employee with feedback. The employee can revise and resubmit the expense report with corrections or additional documentation.",
  },
  {
    question: "Can I set approval limits?",
    answer:
      "Yes, you can configure approval thresholds so that expenses above certain amounts require additional review or higher-level approval.",
  },
  {
    question: "How are balances updated after approval?",
    answer:
      "Once an expense is approved, the corresponding petty cash balance is automatically deducted. This happens in real-time and is logged for audit purposes.",
  },
];

export default function HowItWorksPage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <FullBleedBand variant="hero" className="py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <ScrollReveal variant="fade-up">
            <h1 className="mb-6 text-4xl font-bold leading-tight text-foreground md:text-5xl">
              From receipt upload to approval—fully streamlined
            </h1>
            <p className="text-lg text-muted-foreground">
              A structured workflow that ensures every expense is properly documented, verified, and approved with complete transparency.
            </p>
          </ScrollReveal>
          <ScrollReveal variant="fade-left" delay={0.2}>
            <div className="relative flex items-center justify-center min-h-[14rem] overflow-hidden min-w-0">
              <WorkflowIllustration className="h-40 sm:h-48 w-auto max-w-full" />
              <div className="absolute bottom-0 right-0">
                <WorkflowLivePanel />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </FullBleedBand>

      {/* Workflow Diagram */}
      <FullBleedBand variant="soft" className="py-20">
        <ScrollReveal className="text-center mb-12">
          <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">
            The PesoWise Workflow
          </h2>
          <p className="text-muted-foreground">
            Five simple steps from expense creation to audit-ready records
          </p>
        </ScrollReveal>
        <div className="relative">
          <div className="absolute top-8 left-0 right-0 h-0.5 bg-border hidden lg:block" aria-hidden />
          <StaggerContainer className="grid gap-6 md:grid-cols-3 lg:grid-cols-5">
            {workflowSteps.map((step, i) => {
              const Icon = step.icon;
              return (
                <StaggerItem key={i}>
                  <div className="relative flex flex-col items-center text-center">
                    <div
                      className={`relative z-10 mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-soft ${step.color}`}
                    >
                      <Icon className="h-8 w-8" />
                    </div>
                    {i < workflowSteps.length - 1 && (
                      <div className="absolute top-8 left-full hidden lg:flex w-full justify-center pointer-events-none -translate-x-1/2">
                        <div className="w-4 h-4 rotate-45 border-t-2 border-r-2 border-primary/30 -mt-2" />
                      </div>
                    )}
                    <h3 className="text-base font-semibold text-foreground mb-2">{step.label}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        </div>
      </FullBleedBand>

      {/* Role Snapshots */}
      <FullBleedBand className="py-20">
        <ScrollReveal className="text-center mb-12">
          <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">
            Role-based Experience
          </h2>
          <p className="text-muted-foreground">
            Each role sees exactly what they need to do their job effectively
          </p>
        </ScrollReveal>
        <StaggerContainer className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {roles.map((role, i) => {
            const Icon = role.icon;
            return (
              <StaggerItem key={i}>
                <div className="rounded-xl border border-border bg-card p-6 shadow-soft card-hover h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${role.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">{role.role}</h3>
                  </div>
                  <ul className="mb-4 space-y-2">
                    {role.responsibilities.map((resp, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-accent mt-0.5" />
                        <span className="text-xs text-muted-foreground">{resp}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pt-4 border-t border-border">
                    <div className="rounded-lg bg-muted/50 px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                      {role.mockAction}
                    </div>
                  </div>
                </div>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </FullBleedBand>

      {/* FAQ */}
      <FullBleedBand variant="soft" className="py-20">
        <ScrollReveal className="text-center mb-12">
          <h2 className="mb-4 text-2xl font-bold text-foreground md:text-3xl">
            Workflow FAQs
          </h2>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <div className="max-w-3xl mx-auto">
            <FAQAccordion items={workflowFaqItems} />
          </div>
        </ScrollReveal>
      </FullBleedBand>

      {/* CTA */}
      <FullBleedBand className="py-20">
        <ScrollReveal variant="scale">
          <CTASection />
        </ScrollReveal>
      </FullBleedBand>
    </MarketingShell>
  );
}
