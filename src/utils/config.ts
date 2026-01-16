import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  },
  tidal: {
    clientId: process.env.TIDAL_CLIENT_ID,
    clientSecret: process.env.TIDAL_CLIENT_SECRET,
  },
};

// Validate required Spotify environment variables
if (!config.spotify.clientId || !config.spotify.clientSecret) {
  throw new Error(
    'Missing Spotify credentials. Please check your .env file and ensure SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are set.'
  );
}

console.log('✓ Configuration loaded successfully');
