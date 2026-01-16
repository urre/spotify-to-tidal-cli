# Spotify to Tidal CLI

A command-line interface tool that converts Spotify playlists to Tidal playlists.

## Features

- Convert Spotify playlist URLs to Tidal playlists.
- Retrieve tracks from Spotify playlists.
- Create new playlists in Tidal with the converted tracks.

## Installation

To install the CLI tool, clone the repository and install the dependencies:

```bash
git clone <repository-url>
cd spotify-to-tidal-cli
npm install
```

## Usage

To use the CLI tool, run the following command:

```bash
npm start <spotify-playlist-url>
```

or

```bash
node bin/cli.js <spotify-playlist-url>
```

Replace `<spotify-playlist-url>` with the URL of the Spotify playlist you want to convert.

## Configuration

Before using the tool, ensure you have the necessary API keys for both Spotify and Tidal. You can configure these settings in the `src/utils/config.ts` file.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.
