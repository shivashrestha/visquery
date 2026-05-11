'use client';

import { useEffect } from 'react';

interface PrivacyModalProps {
  onClose: () => void;
}

export default function PrivacyModal({ onClose }: PrivacyModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="privacy-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Privacy Policy">
      <div className="privacy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="privacy-modal-header">
          <span className="privacy-modal-title">Privacy Policy</span>
          <button className="privacy-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="privacy-modal-body">
          <p className="privacy-meta">Effective date: 1 January 2025 · visquery.com</p>

          <h3>1. Overview</h3>
          <p>
            Visquery ("we", "us", "our") operates visquery.com. This policy explains what data we collect,
            why we collect it, and how we protect it.
          </p>

          <h3>2. Data We Collect</h3>
          <p>
            <strong>Usage data:</strong> browser type, device type, pages visited, search queries, and session
            duration — collected automatically when you use the service.
          </p>
          <p>
            <strong>Uploaded images:</strong> images you submit for visual search are processed in memory
            for query purposes only and are not stored persistently.
          </p>
          <p>
            <strong>Cookies &amp; local storage:</strong> we use browser cookies and localStorage to remember
            your preferences (e.g. saved collections, cookie consent state). No cross-site tracking cookies are used.
          </p>

          <h3>3. How We Use Your Data</h3>
          <ul>
            <li>To provide and improve the search service</li>
            <li>To analyse aggregate usage patterns and fix bugs</li>
            <li>To remember your preferences across sessions</li>
          </ul>

          <h3>4. Data Sharing</h3>
          <p>
            We do not sell, rent, or share your personal data with third parties for marketing purposes.
            We may share anonymised, aggregated analytics with infrastructure and analytics partners.
          </p>

          <h3>5. Data Retention</h3>
          <p>
            Usage logs are retained for up to 90 days. Preference data stored locally on your device
            persists until you clear your browser storage.
          </p>

          <h3>6. Your Rights</h3>
          <p>
            You may request access to, correction of, or deletion of any personal data we hold about you
            by contacting us at <a href="mailto:privacy@visquery.com">privacy@visquery.com</a>.
            If you are in the EU/EEA, you have additional rights under GDPR.
          </p>

          <h3>7. Cookies</h3>
          <p>
            Strictly necessary cookies are required for the site to function. Analytics cookies are only
            set after you accept via the cookie banner. You may withdraw consent at any time by clearing
            your browser cookies.
          </p>

          <h3>8. Security</h3>
          <p>
            All data is transmitted over HTTPS. We follow industry-standard practices to protect your data,
            though no method of transmission is 100% secure.
          </p>

          <h3>9. Changes</h3>
          <p>
            We may update this policy periodically. Material changes will be announced on this page with
            a revised effective date.
          </p>

          <h3>10. Contact</h3>
          <p>
            Questions? Email <a href="mailto:privacy@visquery.com">privacy@visquery.com</a> or write to:<br />
            Visquery · visquery.com
          </p>

          <p className="privacy-copyright">© {new Date().getFullYear()} Visquery. All rights reserved. visquery.com</p>
        </div>
      </div>
    </div>
  );
}
