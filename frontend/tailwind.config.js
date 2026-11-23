/** @type {import('tailwindcss').Config} */
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** Colors come from CSS variables (see src/index.css) so one set of class names works in dark and light mode. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: c("night"),
        panel: c("panel"),
        raised: c("raised"),
        line: c("line"),
        ink: c("ink"),
        mute: c("mute"),
        ember: { DEFAULT: c("ember"), dim: c("ember-dim") }, // main accent (blue)
        iris: c("iris"), // second accent (violet)
        glass: c("glass"), // third accent (cyan)
        danger: c("danger"),
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Instrument Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
