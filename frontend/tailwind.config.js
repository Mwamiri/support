/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50:'#eff6ff', 500:'#2E75B6', 600:'#1F5C99', 700:'#1F3864' }
      }
    }
  },
  plugins: []
}
