import { useEffect } from "react";

interface SEOHeadProps {
  title: string;
  description: string;
  canonicalUrl?: string;
  ogImage?: string;
  structuredData?: object;
  faqSchema?: object;
}

export function SEOHead({
  title,
  description,
  canonicalUrl,
  ogImage = "https://pesowise.com/HERO.png",
  structuredData,
  faqSchema
}: SEOHeadProps) {
  useEffect(() => {
    // Update document title
    document.title = title;

    // Update or create meta description
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', description);

    // Update Open Graph tags
    const updateMetaTag = (property: string, content: string) => {
      let tag = document.querySelector(`meta[property="${property}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute('property', property);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };

    updateMetaTag('og:title', title);
    updateMetaTag('og:description', description);
    if (ogImage) {
      updateMetaTag('og:image', ogImage);
    }
    if (canonicalUrl) {
      updateMetaTag('og:url', canonicalUrl);
    }

    // Update canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (canonicalUrl) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      canonical.setAttribute('href', canonicalUrl);
    }

    // Add structured data
    const addStructuredData = (data: object, id: string) => {
      // Remove existing script with same id
      const existing = document.getElementById(id);
      if (existing) {
        existing.remove();
      }

      const script = document.createElement('script');
      script.id = id;
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(data);
      document.head.appendChild(script);
    };

    if (structuredData) {
      addStructuredData(structuredData, 'page-structured-data');
    }

    if (faqSchema) {
      addStructuredData(faqSchema, 'page-faq-schema');
    }
  }, [title, description, canonicalUrl, ogImage, structuredData, faqSchema]);

  return null;
}
