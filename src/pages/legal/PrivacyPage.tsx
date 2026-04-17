import { Link } from "react-router-dom";
import { MarketingShell, FullBleedBand } from "@/components/marketing";

const LAST_UPDATED = "2025-02-04";

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <FullBleedBand variant="hero" className="py-12 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>
      </FullBleedBand>
      <FullBleedBand className="py-12 sm:py-20">
        <article className="mx-auto max-w-4xl space-y-8 leading-relaxed text-muted-foreground">
          <p className="text-foreground">
            This privacy policy describes how PesoWise by Unimisk (“we”, “us”) collects, uses, and
            protects your information when you use our marketing site and contact form. We aim to
            comply with applicable data protection laws, including the GDPR where it applies. This
            is not legal advice.
          </p>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Who we are</h2>
            <p>
              PesoWise is a petty cash and expense management product offered by Unimisk. For
              privacy inquiries you may contact us at the details given at the end of this policy.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">What data we collect</h2>
            <p>
              On the marketing and contact pages we may collect: name, work email, company, phone
              number, role, team size, workflow preferences, and any message you send via the
              contact form. We also store your cookie consent preferences (necessary, analytics,
              marketing) and the timestamp of your consent.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Purpose of processing</h2>
            <p>
              We use your data to respond to your inquiry, provide demos or information about
              PesoWise, improve our services, and ensure security. Where you have consented, we may
              use your data for marketing communications.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Legal bases</h2>
            <p>
              We process your data on the following bases: (1) your consent (e.g. contact form
              consent, cookie consent, optional marketing consent); (2) legitimate interest (e.g.
              responding to inquiries, security); (3) where applicable, performance of a contract
              (e.g. if you become a customer).
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Data retention</h2>
            <p>
              Contact and inquiry data are retained for as long as needed to fulfil the purpose (e.g.
              responding to your request) and for a reasonable period thereafter for record-keeping
              and legal compliance. You can request deletion at any time; we will honour such
              requests where we are not required to retain the data by law.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Data sharing</h2>
            <p>
              We may share your data with service providers (e.g. hosting, email delivery) that
              assist us in operating the site and responding to you. We do not sell your personal
              data. We may disclose data where required by law or to protect our rights.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">International transfers</h2>
            <p>
              If our systems or service providers are located outside your country (including
              outside the EEA), we ensure appropriate safeguards (e.g. standard contractual
              clauses or adequacy decisions) where required by law.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Security</h2>
            <p>
              We use access controls, encryption in transit (HTTPS), and other measures to protect
              your data. No system is completely secure; we encourage you to share only what is
              necessary.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Your rights</h2>
            <p>
              Depending on your location, you may have the right to: access your data, rectify
              inaccuracies, request deletion, data portability, object to processing, withdraw
              consent, and lodge a complaint with a supervisory authority. To exercise these rights,
              contact us using the details below.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Contact</h2>
            <p>
              For privacy-related requests or questions, contact us at{" "}
              <a
                href="mailto:support@unimisk.com"
                className="text-primary underline hover:no-underline"
              >
                support@unimisk.com
              </a>
              . We will respond within a reasonable time.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Changes</h2>
            <p>
              We may update this policy from time to time. The “Last updated” date at the top will
              be revised when we do. We encourage you to review this page periodically.
            </p>
          </section>

          <p className="pt-4">
            <Link to="/" className="text-primary underline hover:no-underline">
              Back to home
            </Link>
          </p>
        </article>
      </FullBleedBand>
    </MarketingShell>
  );
}
