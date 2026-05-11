'use client';

import { useState, useEffect } from 'react';
import PrivacyModal from './PrivacyModal';

const STORAGE_KEY = 'visquery_cookie_consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem(STORAGE_KEY);
    if (!accepted) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem(STORAGE_KEY, 'accepted');
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem(STORAGE_KEY, 'declined');
    setVisible(false);
  };

  if (!visible && !privacyOpen) return null;

  return (
    <>
      {visible && (
        <div className="cookie-bar" role="banner" aria-label="Cookie consent">
          <div className="cookie-bar-content">
            <div className="cookie-bar-text">
              <span className="cookie-bar-copy">
                We use cookies to improve your experience and analyse usage.
                See our{' '}
                <button className="cookie-link" onClick={() => setPrivacyOpen(true)}>
                  Privacy Policy
                </button>
                {' '}for details.
              </span>
              <span className="cookie-copyright">
                © {new Date().getFullYear()} Visquery · visquery.com
              </span>
            </div>
            <div className="cookie-bar-actions">
              <button className="cookie-btn cookie-btn-decline" onClick={decline}>
                Decline
              </button>
              <button className="cookie-btn cookie-btn-accept" onClick={accept}>
                Accept cookies
              </button>
            </div>
          </div>
        </div>
      )}
      {privacyOpen && <PrivacyModal onClose={() => setPrivacyOpen(false)} />}
    </>
  );
}
