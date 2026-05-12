'use client';

import { useState } from 'react';
import PrivacyModal from './PrivacyModal';

export default function SiteFooter() {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  return (
    <>
      <div className="site-footer">
        <span>© {new Date().getFullYear()} Visquery · visquery.com</span>
        <button className="site-footer-link" onClick={() => setPrivacyOpen(true)}>
          Privacy Policy
        </button>
      </div>
      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}
    </>
  );
}
