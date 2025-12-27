/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./services/**/*.{js,ts,jsx,tsx}",
        "./*.{js,ts,jsx,tsx}"
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                serif: ['Playfair Display', 'serif'],
            },
            colors: {
                fashion: {
                    black: '#0a0a0a',
                    dark: '#171717',
                    gray: '#262626',
                    accent: '#000000', // Black
                    light: '#f5f5f5',
                }
            }
        },
    },
    plugins: [],
}
