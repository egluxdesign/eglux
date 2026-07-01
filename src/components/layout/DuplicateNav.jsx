import React, { forwardRef } from 'react';
import { NAV_LINKS } from '../../data';

const DuplicateNav = forwardRef(function DuplicateNav({ isStuck }, ref) {
  return (
    <div className="min-h-[48px]">
      <nav
      id="duplicateNav"
      ref={ref}
      className={`duplicate-nav${isStuck ? ' stuck' : ''}`}
    >
        <div className="max-w-container mx-auto px-8 h-12 flex justify-center items-center">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-4 nav-link"
            >
              {link.label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
});

export default DuplicateNav;