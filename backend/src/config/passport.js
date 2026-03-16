import passport from "passport";
import { Strategy as GitHubStrategy } from "passport-github2";
import './env.js';

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: process.env.GITHUB_CALLBACK_URL || "http://localhost:5000/api/auth/github/callback",
      passReqToCallback: false
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        return done(null, {
          githubId: profile.id,
          accessToken,
        });
      } catch (err) {
        return done(err, false);
      }
    }
  )
);

// Required for OAuth session support
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

export default passport;
