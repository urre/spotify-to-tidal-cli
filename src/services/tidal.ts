import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config';
import { Track } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as crypto from 'crypto';

interface TidalAuthResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    user?: {
        userId: string;
    };
}

interface TidalSearchResult {
    tracks?: {
        items: Array<{
            id: number;
            title: string;
            artist: { name: string };
            artists: Array<{ name: string }>;
        }>;
    };
}

interface TidalPlaylistResponse {
    data?: {
        id: string;
        type: string;
    };
    uuid?: string;
    title?: string;
}

class TidalService {
    private apiClient: AxiosInstance;
    private accessToken: string | null = null;
    private refreshToken: string | null = null;
    private tokenExpiresAt: number | null = null;
    private userId: string | null = null;
    private tokenPath: string;

    constructor() {
        this.apiClient = axios.create({
            baseURL: 'https://openapi.tidal.com/v2',
        });
        this.tokenPath = path.join(process.cwd(), '.tidal-token.json');
        this.loadToken();
    }

    private loadToken(): void {
        try {
            if (fs.existsSync(this.tokenPath)) {
                const data = JSON.parse(fs.readFileSync(this.tokenPath, 'utf-8'));
                this.accessToken = data.access_token;
                this.refreshToken = data.refresh_token;
                this.tokenExpiresAt = data.expires_at;
                this.userId = data.userId;
                if (this.accessToken && !this.isTokenExpired()) {
                    this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
                    this.apiClient.defaults.headers.common['X-Tidal-Token'] = this.accessToken;
                }
            }
        } catch (error) {
            // Ignore errors, will authenticate
        }
    }

    private saveToken(token: string, userId: string, refreshToken?: string, expiresIn?: number): void {
        const expiresAt = expiresIn ? Date.now() + (expiresIn * 1000) : null;
        fs.writeFileSync(this.tokenPath, JSON.stringify({
            access_token: token,
            refresh_token: refreshToken,
            expires_at: expiresAt,
            userId: userId,
        }, null, 2));
        this.refreshToken = refreshToken || null;
        this.tokenExpiresAt = expiresAt;
    }

    private isTokenExpired(): boolean {
        if (!this.tokenExpiresAt) return false;
        // Consider token expired 5 minutes before actual expiry
        return Date.now() >= (this.tokenExpiresAt - 300000);
    }

    private async refreshAccessToken(): Promise<void> {
        if (!this.refreshToken) {
            throw new Error('No refresh token available');
        }

        try {
            console.log('🔄 Refreshing access token...');
            const response = await axios.post<TidalAuthResponse>(
                'https://auth.tidal.com/v1/oauth2/token',
                new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: this.refreshToken,
                    client_id: config.tidal.clientId!,
                }),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                }
            );

            this.accessToken = response.data.access_token;
            this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
            this.apiClient.defaults.headers.common['X-Tidal-Token'] = this.accessToken;

            if (this.userId) {
                this.saveToken(
                    response.data.access_token,
                    this.userId,
                    response.data.refresh_token || this.refreshToken,
                    response.data.expires_in
                );
            }

            console.log('✓ Token refreshed successfully\n');
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('Failed to refresh token:', error.response?.data);
            }
            // Clear tokens and force re-authentication
            this.accessToken = null;
            this.refreshToken = null;
            this.tokenExpiresAt = null;
            throw new Error('Token refresh failed, please re-authenticate');
        }
    }

    private generateCodeVerifier(): string {
        return crypto.randomBytes(32).toString('base64url');
    }

    private generateCodeChallenge(verifier: string): string {
        return crypto.createHash('sha256').update(verifier).digest('base64url');
    }

    private async authenticateWithCallback(): Promise<void> {
        return new Promise((resolve, reject) => {
            const codeVerifier = this.generateCodeVerifier();
            const codeChallenge = this.generateCodeChallenge(codeVerifier);
            const redirectUri = 'http://localhost:8080';

            const authUrl = `https://login.tidal.com/authorize?` +
                `response_type=code&` +
                `client_id=${config.tidal.clientId}&` +
                `redirect_uri=${encodeURIComponent(redirectUri)}&` +
                `scope=user.read+search.read+playlists.read+playlists.write+collection.read+collection.write&` +
                `code_challenge=${codeChallenge}&` +
                `code_challenge_method=S256`;

            console.log('\n🔐 Tidal Authentication Required');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('Opening browser for authentication...');
            console.log('If the browser doesn\'t open, visit this URL:');
            console.log(authUrl);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

            const server = http.createServer(async (req, res) => {
                const url = new URL(req.url!, `http://${req.headers.host}`);
                const code = url.searchParams.get('code');
                const error = url.searchParams.get('error');

                if (error) {
                    res.writeHead(400, { 'Content-Type': 'text/html' });
                    res.end(`<html><body><h1>Authentication Error</h1><p>${error}</p></body></html>`);
                    server.close();
                    reject(new Error(`Authentication error: ${error}`));
                    return;
                }

                if (code) {
                    try {
                        const response = await axios.post<TidalAuthResponse>(
                            'https://auth.tidal.com/v1/oauth2/token',
                            new URLSearchParams({
                                grant_type: 'authorization_code',
                                code: code,
                                client_id: config.tidal.clientId!,
                                redirect_uri: redirectUri,
                                code_verifier: codeVerifier,
                            }),
                            {
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                },
                            }
                        );

                        this.accessToken = response.data.access_token;
                        this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.accessToken}`;
                        this.apiClient.defaults.headers.common['X-Tidal-Token'] = this.accessToken;

                        // Try to get user ID from token response or decode from JWT
                        if (response.data.user?.userId) {
                            this.userId = response.data.user.userId;
                        } else {
                            // Decode JWT to get user ID
                            try {
                                const tokenParts = this.accessToken.split('.');
                                if (tokenParts.length === 3) {
                                    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
                                    this.userId = payload.uid?.toString() || payload.sub?.toString() || payload.userId?.toString() || null;
                                }
                            } catch (err) {
                                console.warn('Could not decode JWT token');
                            }
                        }

                        // If still no user ID, try to fetch from API
                        if (!this.userId) {
                            try {
                                const userResponse = await axios.get('https://openapi.tidal.com/v2/userProfiles/me', {
                                    headers: {
                                        'Authorization': `Bearer ${this.accessToken}`,
                                    },
                                });
                                this.userId = userResponse.data.data?.id?.toString() || null;
                            } catch (err) {
                                if (axios.isAxiosError(err)) {
                                    console.error('Could not fetch user info:', err.response?.data);
                                }
                            }
                        }

                        if (this.accessToken && this.userId) {
                            this.saveToken(
                                this.accessToken,
                                this.userId,
                                response.data.refresh_token,
                                response.data.expires_in
                            );
                        }

                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end('<html><body><h1>✓ Authentication successful!</h1><p>You can close this window and return to the terminal.</p></body></html>');

                        server.close();
                        console.log('✓ Authenticated with Tidal\n');
                        if (this.userId) {
                            console.log(`User ID: ${this.userId}\n`);
                        }
                        resolve();
                    } catch (error) {
                        res.writeHead(500, { 'Content-Type': 'text/html' });
                        if (axios.isAxiosError(error)) {
                            console.error('Auth error:', error.response?.data);
                            res.end(`<html><body><h1>Authentication failed</h1><pre>${JSON.stringify(error.response?.data, null, 2)}</pre></body></html>`);
                        } else {
                            res.end('<html><body><h1>Authentication failed</h1></body></html>');
                        }
                        server.close();
                        reject(error);
                    }
                }
            });

            server.listen(8080, () => {
                // Open browser
                import('open').then((open) => {
                    open.default(authUrl).catch(() => {
                        // If open fails, user can manually open the URL
                    });
                });
            });

            // Timeout after 5 minutes
            setTimeout(() => {
                server.close();
                reject(new Error('Authentication timeout'));
            }, 300000);
        });
    }

    private async authenticate(): Promise<void> {
        // Check if we have a valid token
        if (this.accessToken && !this.isTokenExpired()) {
            return;
        }

        // Try to refresh if we have a refresh token
        if (this.refreshToken && this.isTokenExpired()) {
            try {
                await this.refreshAccessToken();
                return;
            } catch (error) {
                console.log('Token refresh failed, re-authenticating...');
            }
        }

        // Full re-authentication
        await this.authenticateWithCallback();
    }

    async searchTrack(track: Track): Promise<number | null> {
        await this.authenticate();

        try {
            const query = `${track.artist} ${track.title}`.trim();
            const encodedQuery = encodeURIComponent(query);
            const response = await this.apiClient.get(`/searchResults/${encodedQuery}/relationships/tracks`, {
                params: {
                    countryCode: 'US',
                    limit: 1,
                },
            });

            // Debug: log first search to see response structure
            if (process.env.DEBUG) {
                console.log('\nSearch response:', JSON.stringify(response.data, null, 2));
            }

            if (response.data?.data && response.data.data.length > 0) {
                return parseInt(response.data.data[0].id);
            }
            return null;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                // Handle 401 errors by re-authenticating
                if (error.response?.status === 401) {
                    console.log('\n⚠️  Token expired, re-authenticating...');
                    this.accessToken = null;
                    this.refreshToken = null;
                    await this.authenticate();
                    // Retry the search once
                    try {
                        const query = `${track.artist} ${track.title}`.trim();
                        const encodedQuery = encodeURIComponent(query);
                        const response = await this.apiClient.get(`/searchResults/${encodedQuery}/relationships/tracks`, {
                            params: {
                                countryCode: 'US',
                                limit: 1,
                            },
                        });
                        if (response.data?.data && response.data.data.length > 0) {
                            return parseInt(response.data.data[0].id);
                        }
                    } catch (retryError) {
                        console.error(`\nRetry search error for "${track.artist} - ${track.title}":`, axios.isAxiosError(retryError) ? retryError.response?.data : retryError);
                    }
                } else {
                    console.error(`\nSearch error for "${track.artist} - ${track.title}":`, error.response?.status, error.response?.data);
                }
            }
            return null;
        }
    }

    async createPlaylist(playlistName: string, tracks: Track[]): Promise<void> {
        await this.authenticate();

        if (!this.userId) {
            throw new Error('User ID not available. Please re-authenticate.');
        }

        console.log(`\n🔍 Searching for ${tracks.length} tracks on Tidal...`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        const tidalTrackIds: number[] = [];
        const notFound: Track[] = [];

        for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            process.stdout.write(`\r[${i + 1}/${tracks.length}] ${track.artist} - ${track.title}`.slice(0, 80).padEnd(80));

            const tidalId = await this.searchTrack(track);
            if (tidalId) {
                tidalTrackIds.push(tidalId);
            } else {
                notFound.push(track);
            }

            // Rate limiting - increase delay to avoid 429 errors
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        console.log(`\n\n✓ Found ${tidalTrackIds.length} out of ${tracks.length} tracks\n`);

        if (notFound.length > 0) {
            console.log(`⚠️  Could not find ${notFound.length} tracks:`);
            notFound.slice(0, 5).forEach(track => {
                console.log(`   • ${track.artist} - ${track.title}`);
            });
            if (notFound.length > 5) {
                console.log(`   ... and ${notFound.length - 5} more`);
            }
            console.log();
        }

        if (tidalTrackIds.length === 0) {
            throw new Error('No tracks found on Tidal');
        }

        console.log('📝 Creating playlist on Tidal...');

        try {
            // Create playlist using v2 API format
            const createResponse = await this.apiClient.post<TidalPlaylistResponse>(
                `/playlists`,
                {
                    data: {
                        type: 'playlists',
                        attributes: {
                            name: playlistName,
                            description: 'Converted from Spotify',
                            folderId: 'root',
                        },
                    },
                },
            );

            const playlistId = createResponse.data.data?.id || createResponse.data.uuid;
            console.log(`✓ Created playlist: ${playlistName}`);

            // Add tracks in batches (max 20 per request)
            console.log('➕ Adding tracks to playlist...');
            const batchSize = 20;
            for (let i = 0; i < tidalTrackIds.length; i += batchSize) {
                const batch = tidalTrackIds.slice(i, i + batchSize);
                await this.apiClient.post(
                    `/playlists/${playlistId}/relationships/items`,
                    {
                        data: batch.map(id => ({
                            type: 'tracks',
                            id: id.toString(),
                        })),
                    },
                );
            }

            console.log(`✓ Added ${tidalTrackIds.length} tracks to playlist`);
            console.log(`\n🎵 Playlist URL: https://listen.tidal.com/playlist/${playlistId}`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('API Error:', error.response?.status, error.response?.data);
                throw new Error(`Failed to create playlist: ${error.response?.data?.userMessage || error.message}`);
            }
            throw error;
        }
    }
}

export default TidalService;
