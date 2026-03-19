/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  content: [
    "./App.tsx",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        brand: {
          white: "#FFFFFF",
          purple: "#140A26",
          red: "#DC2626",
        },
        text: {
          light: "#28282b",
          dark: "#FFFFFF",
          placeholderLight: "rgba(40, 40, 43, 0.55)",
          placeholderDark: "rgba(255, 255, 255, 0.62)",
        },
        app: {
          bg: "#FFFFFF",
          bgDark: "#140A26",
          highlight: "#140A26",
          highlightDark: "#FFFFFF",
          text: "#28282b",
          textDark: "#FFFFFF",
        },
        success: {
          green: "#16A34A",
        },
        button: {
          primary: "#140A26",
          neutral: "#FFFFFF",
          danger: "#DC2626",
        },
      },
    },
  },
  plugins: [],
};
