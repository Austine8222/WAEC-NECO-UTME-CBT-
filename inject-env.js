/**
 * Netlify production build step.
 *
 * This project no longer injects server secrets into the frontend. Firebase
 * web configuration and the Paystack public key are intentionally kept in
 * app.js, while Paystack/Firebase Admin secrets remain server-side in
 * Netlify environment variables.
 *
 * Netlify is currently configured to run `node inject-env.js` as its build
 * command. Keep this file as a safe no-op build step so that existing site
 * settings continue to work.
 */
console.log('Production build: no frontend environment injection is required.');
console.log('Server secrets remain in Netlify environment variables.');
process.exit(0);
