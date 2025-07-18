import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchMovieTMDB, getMovieSoundtrackDetailsTMDB, getTmdbPosterUrl } from '../api/tmdb.js';
import { searchLetterboxd } from '../scraper/searchLetterboxd.js';

export default {
    data: new SlashCommandBuilder()
        .setName('soundtrack')
        .setDescription('Finds soundtrack details, composers, and trailers for a given film.')
        .addStringOption(option =>
            option.setName('film')
                .setDescription('The title of the film to find soundtrack details for.')
                .setRequired(true)),
    
    async execute(interaction) {
        await interaction.deferReply();

        const filmQuery = interaction.options.getString('film');

        let tmdbMovie = null;
        let movieTitle = filmQuery;
        let movieYear = null;
        
        try {
            tmdbMovie = await searchMovieTMDB(filmQuery);

            if (!tmdbMovie) {
                const letterboxdSearchResults = await searchLetterboxd(filmQuery);
                const filmResult = letterboxdSearchResults.find(r => r.type === 'film');

                if (filmResult) {
                    console.log(`[Soundtrack Command] Found on Letterboxd: ${filmResult.title} (${filmResult.year})`);
                    movieTitle = filmResult.title;
                    movieYear = filmResult.year;
                    tmdbMovie = await searchMovieTMDB(filmResult.title, filmResult.year);
                }
            }

            if (!tmdbMovie) {
                await interaction.editReply(`Could not find the film "${filmQuery}". Please try a different title.`);
                return;
            }

            movieTitle = tmdbMovie.title;
            movieYear = tmdbMovie.release_date ? new Date(tmdbMovie.release_date).getFullYear() : 'N/A';

            const soundtrackDetails = await getMovieSoundtrackDetailsTMDB(tmdbMovie.id);

            const embed = new EmbedBuilder()
                .setColor(0x3498db)
                .setTitle(`Soundtrack Details for ${movieTitle} (${movieYear}) 🎵`)
                .setURL(`https://www.themoviedb.org/movie/${tmdbMovie.id}`);

            if (tmdbMovie.poster_path) {
                embed.setThumbnail(getTmdbPosterUrl(tmdbMovie.poster_path, 'w92'));
            }

            let description = '';

            if (soundtrackDetails.composers && soundtrackDetails.composers.length > 0) {
                description += `**Composers:** ${soundtrackDetails.composers.join(', ')}\n\n`;
            } else {
                description += '**Composers:** N/A\n\n';
            }

            if (soundtrackDetails.trailers && soundtrackDetails.trailers.length > 0) {
                description += '**Trailers:**\n';
                soundtrackDetails.trailers.forEach((url, index) => {
                    description += `[Trailer ${index + 1}](${url})\n`;
                });
                description += '\n';
            }

            if (soundtrackDetails.ost_videos && soundtrackDetails.ost_videos.length > 0) {
                description += '**OST / Main Themes:**\n';
                soundtrackDetails.ost_videos.forEach((url, index) => {
                    description += `[Video ${index + 1}](${url})\n`;
                });
                description += '\n';
            }

            if (!description.trim()) {
                description = 'No soundtrack details found for this film.';
            }

            embed.setDescription(description);

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(`Error executing /soundtrack command:`, error);
            await interaction.editReply('An error occurred while fetching soundtrack details. Please try again later.');
        }
    }
};