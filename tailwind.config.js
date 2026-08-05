/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        void: "#0B0F14",
        panel: "#141B23",
        line: "#26313D",
        amber: "#F5A623",
        signal: "#E5484D",
        pass: "#30A46C",
        bone: "#E6EAEF",
        dim: "#8A99A8",
      },
      fontFamily: {
        display: ["'Barlow Condensed'", "sans-serif"],
        body: ["'IBM Plex Sans'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
