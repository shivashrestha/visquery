'use client';

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import PrivacyModal from './PrivacyModal';
import ContactModal from './ContactModal';

export default function SiteFooter() {
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <>
      <div className="footer-ruler" aria-hidden="true">
        {[0, 1].map((g) => (
          <div key={g} className="footer-ruler-group">
            {[1, 0, 0, 0, 1].map((tall, i) => (
              <div key={i} className={`ruler-tick ${tall ? 'ruler-tick-tall' : 'ruler-tick-short'}`} />
            ))}
          </div>
        ))}
      </div>
      <div className="site-footer">
        <span>© {new Date().getFullYear()} Visquery · visquery.com</span>
        <button className="site-footer-link" onClick={() => setPrivacyOpen(true)}>
          Privacy Policy
        </button>
        <button className="site-footer-link" onClick={() => setContactOpen(true)}>
          Contact
        </button>
      </div>

      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}

      <AnimatePresence>
        {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
