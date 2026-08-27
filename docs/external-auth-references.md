# Authentication implementation references

## Google account selection after deliberate sign-out

The Web/PWA implementation keeps `GoogleAuthProvider` configured with the OAuth `prompt=select_account` custom parameter. Google OAuth 2.0 documents this prompt as requesting that the user select an account. The Android implementation must additionally sign out of the native Google Sign-In SDK after an intentional application logout so that native account state is not silently reused on the next sign-in attempt.

The Firebase Authentication sign-out guidance requires clearing Firebase's local credential state. Together Ledger distinguishes a user-initiated logout from transient offline recovery and confirmed session revocation; only the deliberate logout path clears the native Google Sign-In state.

## Sources

1. Google Developers, [Using OAuth 2.0 for Web Server Applications — authorization prompt parameters](https://developers.google.com/identity/protocols/oauth2/web-server).
2. Firebase, [Authenticate with Google on Android](https://firebase.google.com/docs/auth/android/google-signin).
3. React Native Google Sign-In, [documentation](https://react-native-google-signin.github.io/).
