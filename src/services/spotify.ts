import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config';
import { Track } from '../types';

interface SpotifyTrackItem {
    track: {
        name: string;
        artists: Array<{ name: string }>;
        album: { name: string };
        uri: string;
        id: string;
        duration_ms: number;
    };
}

interface SpotifyPlaylistResponse {
    items: SpotifyTrackItem[];
}

class SpotifyService {
    private apiClient: AxiosInstance;
    private accessToken: string | null = null;

    constructor() {
        this.apiClient = axios.create({
            baseURL: 'https://api.spotify.com/v1',
        });
    }

    private async authenticate(): Promise<void> {
        const response = await axios.post(
            'https://accounts.spotify.com/api/token',
            'grant_type=client_credentials',
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(
                        `${config.spotify.clientId}:${config.spotify.clientSecret}`
                    ).toString('base64')}`,
                },
            }
        );
        this.accessToken = response.data.access_token;
        this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
    }

    async getPlaylistTracks(playlistUrl: string): Promise<Track[]> {
        if (!this.accessToken) {
            await this.authenticate();
        }

        const playlistId = this.extractPlaylistId(playlistUrl);
        if (!playlistId) {
            throw new Error('Invalid Spotify playlist URL');
        }

        const response = await this.apiClient.get<SpotifyPlaylistResponse>(
            `/playlists/${playlistId}/tracks`
        );

        return response.data.items.map((item: SpotifyTrackItem) => ({
            id: item.track.id,
            title: item.track.name,
            artist: item.track.artists.map((artist: { name: string }) => artist.name).join(', '),
            album: item.track.album.name,
            duration: Math.floor(item.track.duration_ms / 1000),
        }));
    }

    private extractPlaylistId(url: string): string | null {
        const regex = /playlist\/([a-zA-Z0-9]+)/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }
}

export default SpotifyService;
