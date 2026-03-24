/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4fb",
          100: "#d7e4f5",
          200: "#b7cdea",
          300: "#8eaddb",
          400: "#5f87c7",
          500: "#3563ae",
          600: "#1f4f97",
          700: "#123f84",
          800: "#0b3c6d",
          900: "#082d52"
        },
        accent: {
          50: "#f9f4e5",
          100: "#f2e7be",
          200: "#e8d485",
          300: "#ddc24d",
          400: "#d2b125",
          500: "#c9a227",
          600: "#ae8920",
          700: "#8f6e19",
          800: "#705613",
          900: "#52400d"
        }
      }
    }
  },
  plugins: [require("@tailwindcss/forms")]
};

