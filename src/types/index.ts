export interface Track {
    id: string;
    title: string;
    artist: string;
    album: string;
    duration: number; // duration in seconds
}

export interface Playlist {
    id: string;
    name: string;
    description: string;
    tracks: Track[];
}