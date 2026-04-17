import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarketingLayout } from "@/components/marketing/MarketingLayout";
import { Section, SectionBand } from "@/components/marketing/Section";
import { HeroBackdrop } from "@/components/marketing/HeroBackdrop";
import { FloatingOrbs } from "@/components/marketing/FloatingOrbs";
import { MockDashboard } from "@/components/marketing/MockDashboard";
import { LogoStrip } from "@/components/marketing/LogoStrip";
import { TestimonialCards } from "@/components/marketing/TestimonialCards";
import { GifSlot } from "@/components/marketing/GifSlot";
import { SEOHead } from "@/components/SEOHead";
import {
    Receipt,
    Users,
    Shield,
    BarChart3,
    CheckCircle2,
    ArrowRight,
    Building2,
    Wallet,
    FileText,
    Clock,
    Eye,
    MessageSquare,
    TrendingUp,
    Lock,
    Database,
    FileCheck,
    Download,
    Zap,
    CheckCircle,
    XCircle,
    AlertCircle
} from "lucide-react";

export default function Landing() {
    const navigate = useNavigate();

    const structuredData = {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "PesoWise",
        "applicationCategory": "FinanceApplication",
        "operatingSystem": "Web",
        "description": "PesoWise is a secure petty cash and expense management platform for teams. Track expenses, automate approvals, manage balances, and maintain audit-ready records.",
        "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD",
            "availability": "https://schema.org/InStock"
        },
        "provider": {
            "@type": "Organization",
            "name": "Unimisk",
            "url": "https://unimisk.com"
        },
        "featureList": [
            "Petty cash management",
            "Expense tracking",
            "Approval workflows",
            "Receipt management",
            "Balance tracking",
            "Multi-organization support"
        ]
    };

    return (
        <>
            <SEOHead
                title="PesoWise – Petty Cash & Expense Management Software for Teams"
                description="PesoWise is a secure petty cash and expense management platform for teams. Track expenses, automate approvals, manage balances, and maintain audit-ready records."
                canonicalUrl="https://pesowise.com/"
                structuredData={structuredData}
            />
            <MarketingLayout>
                {/* A) HERO SECTION */}
                <Section className="relative py-20 lg:py-28 overflow-hidden">
                    <div className="absolute inset-0 w-full">
                        <HeroBackdrop />
                        <FloatingOrbs />
                    </div>
                    <div className="relative grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
                        <header className="space-y-6">
                            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900">
                                Petty Cash & Expense Management — Simplified.
                            </h1>
                            <p className="text-xl text-gray-600 leading-relaxed">
                                Track employee expenses, automate approvals, and control balances — all in one secure platform.
                            </p>
                        </header>
                        <p className="text-sm text-gray-500 flex items-center gap-2">
                            <span>Built for modern teams</span>
                            <span>•</span>
                            <span>Secure</span>
                            <span>•</span>
                            <span>Multi-organization ready</span>
                        </p>
                        <div className="flex flex-col sm:flex-row gap-4 pt-4">
                            <Button
                                size="lg"
                                onClick={() => navigate("/contact")}
                                className="text-lg px-8 bg-blue-600 hover:bg-blue-700"
                                aria-label="Get started with PesoWise for free"
                            >
                                Get Started Free
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                            <div className="flex flex-col">
                                <Button
                                    size="lg"
                                    variant="outline"
                                    onClick={() => navigate("/auth")}
                                    className="text-lg px-8 border-2"
                                    aria-label="Login to PesoWise"
                                >
                                    Login
                                </Button>
                                <p className="text-xs text-gray-500 mt-1 text-center">Already using PesoWise?</p>
                            </div>
                        </div>

                        {/* Dashboard Preview Mock */}
                        <aside className="relative w-full max-w-none lg:justify-self-end" aria-label="PesoWise dashboard preview">
                            <MockDashboard />
                        </aside>
                    </div>
                </Section>

                {/* Logo Strip */}
                <SectionBand className="py-12">
                    <LogoStrip />
                </SectionBand>

                {/* B) PROBLEM → SOLUTION */}
                <SectionBand>
                    <div className="text-center space-y-8">
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
                            Still managing petty cash on spreadsheets, WhatsApp, or emails?
                        </h2>
                        <div className="grid sm:grid-cols-2 gap-6 pt-8">
                            <div className="flex items-start gap-3 text-left">
                                <XCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
                                <p className="text-gray-700">No visibility on who spent what</p>
                            </div>
                            <div className="flex items-start gap-3 text-left">
                                <XCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
                                <p className="text-gray-700">Manual approvals & delays</p>
                            </div>
                            <div className="flex items-start gap-3 text-left">
                                <XCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
                                <p className="text-gray-700">Balance mismatches and errors</p>
                            </div>
                            <div className="flex items-start gap-3 text-left">
                                <XCircle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
                                <p className="text-gray-700">No audit trail or compliance</p>
                            </div>
                        </div>
                        <p className="text-xl text-gray-700 font-medium pt-4">
                            PesoWise brings clarity, control, and automation to your expense workflows.
                        </p>
                    </div>
                </SectionBand>

                {/* C) HOW IT WORKS */}
                <Section id="how-it-works">
                    <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-12">
                        Expense management that just works.
                    </h2>
                    <p className="text-center text-gray-600 mb-8">
                        Learn more about our <a href="/how-it-works" className="text-blue-600 hover:underline font-medium">expense approval workflow</a> and how it streamlines your process.
                    </p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <Card className="border-2 hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardHeader>
                                <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center mb-4">
                                    <FileText className="h-6 w-6 text-blue-600" />
                                </div>
                                <CardTitle>Submit Expenses</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription>Employees submit expenses with receipts in seconds.</CardDescription>
                            </CardContent>
                        </Card>
                        <Card className="border-2 hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardHeader>
                                <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center mb-4">
                                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                                </div>
                                <CardTitle>Verify & Approve</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription>Engineers verify. Admins approve. No back-and-forth.</CardDescription>
                            </CardContent>
                        </Card>
                        <Card className="border-2 hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardHeader>
                                <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center mb-4">
                                    <Zap className="h-6 w-6 text-purple-600" />
                                </div>
                                <CardTitle>Balance Updates Automatically</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription>Approved expenses deduct balances instantly — no manual math.</CardDescription>
                            </CardContent>
                        </Card>
                        <Card className="border-2 hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardHeader>
                                <div className="h-12 w-12 rounded-lg bg-orange-100 flex items-center justify-center mb-4">
                                    <BarChart3 className="h-6 w-6 text-orange-600" />
                                </div>
                                <CardTitle>Track Everything</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription>Real-time dashboards, reports, and audit trails.</CardDescription>
                            </CardContent>
                        </Card>
                    </div>
                </Section>

                {/* D) ROLE-BASED */}
                <SectionBand>
                    <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-12">
                        Designed for every role in your organization.
                    </h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <Card className="hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardHeader>
                                <CardTitle className="text-blue-600">Employee</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <p className="text-sm text-gray-600">• Submit expenses</p>
                                <p className="text-sm text-gray-600">• Upload receipts</p>
                                <p className="text-sm text-gray-600">• Track approval status</p>
                                <p className="text-sm text-gray-600">• View balance</p>
                            </CardContent>
                        </Card>
                        <Card className="hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardHeader>
                                <CardTitle className="text-green-600">Engineer / Manager</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <p className="text-sm text-gray-600">• Verify expenses</p>
                                <p className="text-sm text-gray-600">• Add comments</p>
                                <p className="text-sm text-gray-600">• Approve within limits</p>
                                <p className="text-sm text-gray-600">• Monitor team spending</p>
                            </CardContent>
                        </Card>
                        <Card className="hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardHeader>
                                <CardTitle className="text-purple-600">Admin</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <p className="text-sm text-gray-600">• Create users</p>
                                <p className="text-sm text-gray-600">• Control approvals</p>
                                <p className="text-sm text-gray-600">• Manage balances</p>
                                <p className="text-sm text-gray-600">• View analytics</p>
                            </CardContent>
                        </Card>
                        <Card className="hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardHeader>
                                <CardTitle className="text-orange-600">Cashier</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                <p className="text-sm text-gray-600">• Add or transfer funds</p>
                                <p className="text-sm text-gray-600">• Process returns</p>
                                <p className="text-sm text-gray-600">• Maintain cash flow</p>
                            </CardContent>
                        </Card>
                    </div>
                </SectionBand>

                {/* E) CORE FEATURES */}
                <Section id="features">
                    <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-12">
                        Everything you need. Nothing you don't.
                    </h2>
                    <p className="text-center text-gray-600 mb-8">
                        Explore our complete <a href="/features" className="text-blue-600 hover:underline font-medium">expense management features</a> including receipt management systems and multi-organization support.
                    </p>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            "Multi-step approval workflows",
                            "Real-time balance tracking",
                            "Secure receipt uploads",
                            "Multi-organization support",
                            "Role-based dashboards",
                            "Custom categories & locations",
                            "Audit logs & compliance-ready",
                            "Exportable reports (CSV)"
                        ].map((feature, index) => (
                            <div key={index} className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                                <p className="text-gray-700">{feature}</p>
                            </div>
                        ))}
                    </div>
                </Section>

                {/* F) SECURITY & TRUST */}
                <SectionBand id="security">
                    <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-8">
                        Secure by design.
                    </h2>
                    <p className="text-center text-gray-600 mb-8">
                        Learn about our <a href="/security" className="text-blue-600 hover:underline font-medium">security practices</a> including row level security and organization isolation.
                    </p>
                    <div className="space-y-4 max-w-3xl mx-auto">
                        <div className="flex items-start gap-3">
                            <Database className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                            <p className="text-gray-700">Database-level security with Row Level Security (RLS)</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <Shield className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                            <p className="text-gray-700">Organization-level data isolation</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <Lock className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                            <p className="text-gray-700">Secure file storage for receipts</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <FileCheck className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                            <p className="text-gray-700">Full audit trails for compliance</p>
                        </div>
                    </div>
                    <p className="text-center text-gray-600 mt-8">
                        Powered by enterprise-grade infrastructure.
                    </p>
                </SectionBand>

                {/* G) ANALYTICS PREVIEW */}
                <Section>
                    <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-12">
                        Insights that help you make better decisions.
                    </h2>
                    <div className="grid sm:grid-cols-2 gap-6 mb-8">
                        <div className="flex items-start gap-3">
                            <TrendingUp className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                            <p className="text-gray-700">Expense trends by category</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <BarChart3 className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                            <p className="text-gray-700">Pending vs approved amounts</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <Wallet className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                            <p className="text-gray-700">Balance overview across teams</p>
                        </div>
                        <div className="flex items-start gap-3">
                            <Zap className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
                            <p className="text-gray-700">Faster approval cycles</p>
                        </div>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-8 border border-blue-100">
                        <div className="h-64 bg-white/50 rounded-lg flex items-center justify-center">
                            <p className="text-gray-400 text-sm">Analytics Dashboard Preview</p>
                        </div>
                    </div>
                </Section>

                {/* Why PesoWise */}
                <Section>
                    <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-12">
                        Why PesoWise?
                    </h2>
                    <div className="grid sm:grid-cols-3 gap-6">
                        <Card className="text-center hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardHeader>
                                <Zap className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                                <CardTitle>Faster approvals</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription>
                                    Automated workflows reduce approval time from days to minutes
                                </CardDescription>
                            </CardContent>
                        </Card>
                        <Card className="text-center hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardHeader>
                                <Wallet className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                                <CardTitle>Real-time balances</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription>
                                    Instant balance updates with every transaction and approval
                                </CardDescription>
                            </CardContent>
                        </Card>
                        <Card className="text-center hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardHeader>
                                <FileCheck className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                                <CardTitle>Audit-ready records</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <CardDescription>
                                    Complete audit trails for compliance and financial reporting
                                </CardDescription>
                            </CardContent>
                        </Card>
                    </div>
                </Section>

                {/* Testimonials */}
                <SectionBand>
                    <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-12">
                        What teams are saying
                    </h2>
                    <TestimonialCards />
                </SectionBand>

                {/* H) WHO IT'S FOR */}
                <Section>
                    <h2 className="text-3xl sm:text-4xl font-bold text-center text-gray-900 mb-12">
                        Built for growing teams and modern organizations.
                    </h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <Card className="text-center hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardContent className="pt-6">
                                <Building2 className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                                <p className="text-gray-700 font-medium">Small & medium businesses</p>
                            </CardContent>
                        </Card>
                        <Card className="text-center hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardContent className="pt-6">
                                <Users className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                                <p className="text-gray-700 font-medium">Operations & finance teams</p>
                            </CardContent>
                        </Card>
                        <Card className="text-center hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardContent className="pt-6">
                                <Building2 className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                                <p className="text-gray-700 font-medium">Multi-location organizations</p>
                            </CardContent>
                        </Card>
                        <Card className="text-center hover:shadow-lg transition-all hover:-translate-y-1">
                            <CardContent className="pt-6">
                                <FileCheck className="h-12 w-12 text-blue-600 mx-auto mb-4" />
                                <p className="text-gray-700 font-medium">Teams needing audit-ready expense tracking</p>
                            </CardContent>
                        </Card>
                    </div>
                </Section>

                {/* GEO: Plain English Summary */}
                <Section className="bg-white py-12">
                    <article className="max-w-3xl mx-auto">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">What does PesoWise do?</h2>
                        <p className="text-lg text-gray-700 leading-relaxed">
                            PesoWise helps organizations manage petty cash and employee expenses. Teams can submit expenses, upload receipts, route approvals, track balances, and maintain secure audit trails. It's designed for businesses that need visibility, control, and compliance across employee spending without the complexity of traditional expense management systems.
                        </p>
                    </article>
                </Section>

                {/* About PesoWise Semantic Block */}
                <SectionBand className="py-12">
                    <section className="max-w-4xl mx-auto">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4 sr-only">About PesoWise</h2>
                        <p className="text-gray-700 text-lg leading-relaxed">
                            PesoWise is a multi-tenant SaaS platform for petty cash and expense management. It helps organizations track employee expenses, automate approval workflows, manage balances, and maintain audit trails. The platform supports multiple organizations with strict data isolation, role-based access control, and real-time balance tracking for compliance-ready financial records.
                        </p>
                    </section>
                </SectionBand>

                {/* SEO Reinforcement */}
                <SectionBand className="py-12">
                    <div className="max-w-4xl mx-auto text-center">
                        <p className="text-gray-700 text-lg leading-relaxed">
                            PesoWise is a modern petty cash and expense management software designed for teams that need visibility, control, and compliance across employee spending. Whether you're managing office petty cash, travel reimbursements, or site operations expenses, PesoWise provides the tools to streamline your expense approval workflow and maintain audit-ready records.
                        </p>
                    </div>
                </SectionBand>

                {/* I) FINAL CTA */}
                <SectionBand id="final-cta" className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-20">
                    <div className="text-center">
                        <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                            Take control of your expenses — without complexity.
                        </h2>
                        <div className="flex flex-col sm:flex-row gap-4 justify-center mt-8">
                            <Button
                                size="lg"
                                variant="secondary"
                                onClick={() => navigate("/contact")}
                                className="text-lg px-8 bg-white text-blue-600 hover:bg-gray-100"
                                aria-label="Get started with PesoWise for free"
                            >
                                Get Started Free
                                <ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                            <Button
                                size="lg"
                                onClick={() => navigate("/auth")}
                                className="text-lg px-8 bg-white/10 backdrop-blur-sm border-2 border-white text-white hover:bg-white/20 font-semibold"
                                aria-label="Login to your PesoWise account"
                            >
                                Login to Your Account
                            </Button>
                        </div>
                    </div>
                </SectionBand>
            </MarketingLayout>
        </>
    );
}
