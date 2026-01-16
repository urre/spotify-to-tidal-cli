import { Command } from 'commander';
import { convertPlaylist } from './commands/convert';

const program = new Command();

program
  .version('1.0.0')
  .description('Convert Spotify playlists to Tidal playlists')
  .argument('<spotifyUrl>', 'Spotify playlist URL')
  .action(async (spotifyUrl) => {
    try {
      await convertPlaylist(spotifyUrl);
      console.log('\n✓ Playlist converted successfully!');
    } catch (error) {
      if (error instanceof Error) {
        console.error('\n✗ Error converting playlist:', error.message);
      } else {
        console.error('\n✗ An unknown error occurred');
      }
      process.exit(1);
    }
  });

program.parse(process.argv);
