import { Link } from "react-router-dom";
import { MarketingShell, FullBleedBand } from "@/components/marketing";

const LAST_UPDATED = "2025-02-04";

export default function TermsPage() {
  return (
    <MarketingShell>
      <FullBleedBand variant="hero" className="py-12 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
            Terms &amp; Conditions
          </h1>
          <p className="text-sm text-muted-foreground">Last updated: {LAST_UPDATED}</p>
        </div>
      </FullBleedBand>
      <FullBleedBand className="py-12 sm:py-20">
        <article className="mx-auto max-w-4xl space-y-8 leading-relaxed text-muted-foreground">
          <p className="text-foreground">
            These Terms and Conditions (“Terms”) govern your use of the PesoWise website and
            related services offered by Unimisk. By using the site or services, you agree to these
            Terms. This is not legal advice.
          </p>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Acceptance of terms</h2>
            <p>
              By accessing or using the PesoWise website, contact form, or any linked services, you
              agree to be bound by these Terms and our Privacy Policy. If you do not agree, do not
              use the site or services.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Eligibility</h2>
            <p>
              You must be at least 18 years old and have the legal capacity to enter into binding
              agreements. If you are using the site on behalf of an organization, you represent
              that you have authority to bind that organization.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Accounts</h2>
            <p>
              Where we offer an application or account-based service, you are responsible for
              keeping your credentials secure and for all activity under your account. You must
              notify us promptly of any unauthorized use.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Acceptable use</h2>
            <p>
              You agree not to use the site or services for any unlawful purpose, to infringe
              others’ rights, to distribute malware, or to attempt to gain unauthorized access to
              our or others’ systems. We may suspend or terminate access for breach of these Terms.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Intellectual property</h2>
            <p>
              The PesoWise name, logo, and site content are owned by Unimisk or its licensors. You
              may not copy, modify, or use our trademarks or content without our prior written
              consent, except for limited personal or non-commercial use as permitted by law.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Availability</h2>
            <p>
              We strive to keep the site and services available but do not guarantee uninterrupted
              access. We may perform maintenance or make changes without prior notice. We are not
              liable for downtime or unavailability to the extent permitted by law.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, Unimisk and PesoWise shall not be liable for
              any indirect, incidental, special, or consequential damages, or for any loss of data
              or profits, arising from your use of the site or services. Our total liability shall
              not exceed the amount you paid us in the twelve months preceding the claim, or a
              nominal amount if you have not paid us.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Termination</h2>
            <p>
              We may terminate or suspend your access to the site or services at any time, with or
              without cause. Upon termination, your right to use the site and services ceases. Any
              provisions that by their nature should survive (e.g. liability, intellectual
              property) will survive.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Governing law</h2>
            <p>
              These Terms shall be governed by the laws of the jurisdiction in which Unimisk
              operates, without regard to conflict of law principles. Any disputes shall be
              resolved in the courts of that jurisdiction, unless otherwise required by mandatory
              law.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Contact</h2>
            <p>
              For questions about these Terms, contact us at{" "}
              <a
                href="mailto:support@unimisk.com"
                className="text-primary underline hover:no-underline"
              >
                support@unimisk.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-foreground">Changes</h2>
            <p>
              We may update these Terms from time to time. The “Last updated” date at the top
              reflects the latest revision. Continued use of the site or services after changes
              constitutes acceptance of the revised Terms.
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
