# Accessibility Statement

Songbird is committed to providing a real-time communication platform that is accessible, inclusive, and usable by everyone, including people with visual, auditory, motor, or cognitive disabilities.

## Conformance Target

We aim to conform to the [Web Content Accessibility Guidelines (WCAG) 2.1](https://www.w3.org/TR/WCAG21/) at **Level AA**. These guidelines explain how to make web content more accessible to people with a wide range of disabilities.

## Key Accessibility Features

### ⌨️ Keyboard Navigation

* **Complete Operability**: Core chat functions, channel navigation, and settings are fully navigable using a keyboard.
* **Focus Visibility**: Clear, high-contrast focus rings indicate the active element across interactive controls.
* **Modal Dialogs**: Dialogs and popups trap keyboard focus while open and can be closed using the `Escape` key.
* **Logical Tab Flow**: DOM structure follows an intuitive reading and interaction order.

### 📢 Screen Reader Support

* **Semantic HTML**: Proper use of semantic landmark regions (`<main>`, `<nav>`, `<aside>`, `<header>`, and `<dialog>`).
* **ARIA Live Regions**: Live announcements (`aria-live="polite"`) inform screen reader users of incoming messages without interrupting navigation.
* **Labels & Names**: Interactive controls, icon buttons, and inputs include accessible names (`aria-label` or visible labels) compliant with WCAG 2.5.3 (Label in Name).
* **Alternative Text**: Uploaded images support alternative text, and decorative icons are hidden with `aria-hidden="true"`.

### 🎨 Color & Contrast

* **Contrast Ratios**: Foreground text and essential UI elements meet or exceed WCAG AA contrast standards (minimum 4.5:1 for normal text and 3:1 for large text/graphical elements).
* **Color Independence**: Status indicators (online/offline, message states, delivery badges) convey meaning through icons and text, not color alone.
* **Dark Mode**: Both light and dark color schemes are engineered to maintain comfortable contrast and reduce eye strain.

### 🌐 Bilingual & Bidirectional (RTL / LTR)

* **Script Support**: Dynamic script detection ensures proper font rendering (`Vazirmatn` for Persian/Farsi and `DM Sans` for Latin scripts).
* **RTL Layout**: Text direction, icons, and layout flows automatically adapt to right-to-left languages.

### 📱 Responsive Design & Zoom

* **Text Scaling**: Layouts adapt smoothly to browser text resizing up to 200% without loss of functionality or overlapping content.
* **Touch Targets**: On touch devices, interactive buttons and controls meet a minimum touch target size of 44×44 pixels.
* **Reduced Motion**: Animations and transitions respect the user's operating system `prefers-reduced-motion` settings.

## Known Limitations & Roadmap

While we strive for comprehensive coverage, some areas are actively being enhanced:

* **Real-time Voice/Video Calling**: Audio-only fallbacks and screen reader shortcuts for in-call participant controls are undergoing ongoing refinement.
* **Complex Media Previews**: Voice message waveforms and video transcoding indicators are continually updated for enhanced assistive technology descriptions.

## Feedback & Reporting Barriers

We welcome feedback on the accessibility of Songbird. If you encounter an accessibility barrier or have suggestions for improvement, please let us know:

* **Email:** [pouyakhalili83@gmail.com](mailto:pouyakhalili83@gmail.com) (Subject: `[Songbird Accessibility] <Description>`)
* **GitHub Issues:** Submit a report via [GitHub Issues](https://github.com/bllackbull/songbird/issues) with the tag `accessibility`.

We aim to acknowledge feedback within 48 to 72 hours and work toward addressing identified issues in upcoming releases.
