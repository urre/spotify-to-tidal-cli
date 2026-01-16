import SpotifyService from '../services/spotify';
import TidalService from '../services/tidal';
import { Track } from '../types';

export async function convertPlaylist(spotifyUrl: string): Promise<void> {
    const spotifyService = new SpotifyService();
    const tidalService = new TidalService();

    try {
        console.log('Fetching tracks from Spotify playlist...');

        // Retrieve the playlist data from Spotify
        const tracks: Track[] = await spotifyService.getPlaylistTracks(spotifyUrl);

        console.log(`Found ${tracks.length} tracks`);

        // Convert and create the playlist in Tidal
        await tidalService.createPlaylist('Converted Playlist', tracks);

    } catch (error) {
        if (error instanceof Error) {
            throw new Error(`Failed to convert playlist: ${error.message}`);
        }
        throw error;
    }
}
