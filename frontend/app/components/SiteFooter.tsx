'use client';

import { useState } from 'react';
import PrivacyModal from './PrivacyModal';

interface SiteFooterProps {
  hideOnMobileDetail?: boolean;
}

export default function SiteFooter({ hideOnMobileDetail = false }: SiteFooterProps) {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  return (
    <>
      <div className={`site-footer${hideOnMobileDetail ? ' detail-mode' : ''}`}>
        <span>© {new Date().getFullYear()} Visquery · visquery.com</span>
        <button className="site-footer-link" onClick={() => setPrivacyOpen(true)}>
          Privacy Policy
        </button>
      </div>
      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}
    </>
  );
}
