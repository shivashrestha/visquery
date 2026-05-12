'use client';

import { useState } from 'react';
import PrivacyModal from './PrivacyModal';

export default function AppFooter() {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  return (
    <>
      <div className="page-footer">
        <span>© {new Date().getFullYear()} Visquery · visquery.com</span>
        <button className="landing-footer-link" onClick={() => setPrivacyOpen(true)}>
          Privacy Policy
        </button>
      </div>
      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}
    </>
  );
}
