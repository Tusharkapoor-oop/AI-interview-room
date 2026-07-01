# Lux Premium Landing Page & Concierge Onboarding — Integration & Migration Guide

This guide describes how to safely roll out and integrate the Namespaced Luxury Landing UI into the existing codebase without overwriting or breaking any existing logic.

---

## 1. Directory Structure

All files reside inside the isolated namespace folder:
```
frontend/src/lux/
├── LuxTheme.css            # Design tokens & variables
├── LuxHero.jsx             # Cinematic hero and canvas particles
├── LuxConciergeModal.jsx   # Keyboard-accessible onboarding tour
├── LuxFeatures.jsx         # Security features grid
├── LuxTimeline.jsx         # Stepped roadmap timeline
├── LuxTestimonials.jsx    # Testimonial slider
├── LuxInviteForm.jsx       # Admissions access validation
├── LuxFooter.jsx           # Status indicator & links
├── LuxLanding.jsx          # Composed master layout & mountLuxLanding API
└── LuxDemo.jsx             # Live staging environment & feature flag preview
```

---

## 2. Feature Flag Integration Code

To conditionally display the Luxury Landing UI before your existing application flow (e.g. inside `App.jsx`), wrap the entry screen behind a feature flag as shown below:

```jsx
import React, { useState } from 'react';
import LuxLanding from './lux/LuxLanding';
import ExistingOnboardScreen from './OnboardScreen';

export default function App() {
  // 1. Establish feature flag toggle state
  const [useLuxLanding, setUseLuxLanding] = useState(true); 
  const [unlocked, setUnlocked] = useState(false);

  // 2. Callback when concierge tour and admissions request complete
  const handleLuxComplete = (data) => {
    console.log("Lux onboarding successful:", data);
    setUnlocked(true);
  };

  // 3. Conditional routing
  if (useLuxLanding && !unlocked) {
    return (
      <LuxLanding 
        onComplete={handleLuxComplete}
        initialReducedMotion={false}
      />
    );
  }

  // Fallback / standard code
  return <ExistingOnboardScreen />;
}
```

---

## 3. Scoped Vanilla JS Mounting Hook

If you are mounting the landing page into a static HTML block or outside React's lifecycle, invoke the namespaced mounting wrapper `mountLuxLanding`:

```html
<div id="lux-landing-root"></div>

<script>
  // Initialize and mount
  const unmount = window.mountLuxLanding("lux-landing-root", {
    reducedMotion: false,
    onComplete: (data) => {
      console.log("Admissions unlocked!", data);
      // Route candidate into calibration
    }
  });

  // To tear down safely:
  // unmount();
</script>
```

---

## 4. Accessibility Checklist (Target: 90+ Score)
*   **Keyboard Navigation**: Tab loops elements in the modal, preventing users from accessing elements outside the dialog while open.
*   **Escape Key Handler**: Pressing `Escape` triggers the onClose callback immediately.
*   **Lighthouse Focus**: Focus returns to the trigger button or clear landmark when the modal shuts.
*   **Screen Reader Coverage**: Interactive elements contain explicit `aria-label` tags, and the progress bar reports updates using `aria-valuenow`.
*   **Reduced Motion**: Users can toggle off high-motion shimmer lines and scroll effects using the "Reduce Motion" button.

---

## 5. Staging QA Checklist
1.  Verify canvas rendering: verify that the particle canvas resize matches viewport alterations.
2.  Test typing speed: confirm text doesn't wrap awkwardly on smaller mobile screen breakpoints.
3.  Check keyboard compliance: focus should stay locked inside the concierge modal on the 4th step.
4.  Test feature flag toggling: ensure switching `luxEnabled` off in `LuxDemo` immediately restores the fallback experience.

---

## 6. Rollback Plan
Should any visual discrepancy occur during staging:
1.  Set the feature flag `useLuxLanding` state to `false` in `App.jsx`.
2.  Clean up imports from `./lux/LuxLanding`.
3.  Since no existing file or asset was modified during integration, the repository remains completely intact and returns to the stable production state instantly.
