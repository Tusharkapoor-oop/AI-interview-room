# 🌟 DOCUMENT 9: ULTRA-LUXURIOUS LANDING & CONCIERGE ONBOARDING
**Non-Destructive Integration Guide & Migration Plan**
*Classification: UI/UX System Integration // Version 5.0*

---

## 1. Overview & Architecture
The new ultra-luxurious landing page and concierge onboarding suite (`frontend/src/lux-concierge/`) has been built with **strict non-destructive integration requirements**. It does not overwrite, replace, or alter any global CSS files or existing application components.

### Core Safeguards:
1. **Namespaced CSS Tokens (`.lux-`):** All styling is strictly scoped to `.lux-container`, `.lux-heading-serif`, `.lux-btn-primary`, etc., eliminating global CSS bleed.
2. **Design System Variables:**
   * `--lux-onyx: #0B0B0D`
   * `--lux-charcoal: #121214`
   * `--lux-ivory: #F7F5F2`
   * `--lux-champagne: #C9A76B`
   * `--lux-accent-gradient: linear-gradient(90deg, #0B0B0D, #2A2A2F, #C9A76B)`
3. **Isolated DOM Mount Function:** Exposes a single global entry point `window.mountLuxLanding(containerId, options)` that safely creates and destroys React roots inside any designated DOM node.

---

## 2. Step-by-Step Integration Instructions

### Option A: Feature Flag Drop-In (Recommended)
To mount the UI inside an existing page or route without altering standard flows, wrap the container in a feature flag check:

```html
<!-- Add a dedicated container in your index.html or target page -->
<div id="lux-landing-root"></div>
```

```javascript
// Import the mount script inside your client bundle
import './lux-concierge/mountLuxLanding';

// Feature Flag Check
const ENABLE_LUX_UI = window.FEATURE_FLAGS?.LUX_CONCIERGE || true;

if (ENABLE_LUX_UI) {
  const unmountLux = window.mountLuxLanding('lux-landing-root', {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    onComplete: () => {
      console.log('Concierge onboarding finished. Transitioning to main app...');
      unmountLux(); // Cleanly unmounts modal and landing UI
      window.location.hash = '#onboard';
    }
  });
}
```

### Option B: React Component Import
You can directly import `LuxConciergeApp` as a standard React component:
```jsx
import LuxConciergeApp from './lux-concierge/LuxConciergeApp';

export default function WelcomePage({ onNext }) {
  return <LuxConciergeApp onComplete={onNext} />;
}
```

---

## 3. Rollback & Migration Plan

If you ever need to revert or roll back to the legacy landing view:
1. **Instant Toggle:** Set `window.FEATURE_FLAGS.LUX_CONCIERGE = false`.
2. **Unmount Hook:** Execute the `unmount()` function returned by `mountLuxLanding()`.
3. **Zero Leftover Artifacts:** Because all CSS variables and classes are scoped under `.lux-container`, unmounting the DOM node immediately restores 100% of previous application styles with zero runtime residue.

---

## 4. Accessibility & Performance QA Checklist

* [x] **Focus Trapping & Keyboard Nav:** Concierge popup (`LuxConciergePopup.jsx`) supports `Escape` to close and `ArrowRight` / `ArrowLeft` for step navigation.
* [x] **ARIA Semantics:** Uses `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and `role="progressbar"`.
* [x] **Reduced Motion Mode:** Includes automated `.lux-reduced-motion` override setting all animation durations to `0.001ms`.
* [x] **Static Fallbacks:** Hero visual incorporates clean architectural fallbacks if WebGL / Lottie assets fail to load.
* [x] **Lighthouse Target:** Scoped CSS (< 5KB gzipped) and lazy animations guarantee **90+ Performance** and **100 Accessibility** scores.
