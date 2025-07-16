// commands/soundtrack.js

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchMovieTMDB, getMovieSoundtrackDetailsTMDB, getTmdbPosterUrl } from '../api/tmdb.js';
import { searchLetterboxd } from '../scraper/searchLetterboxd.js';

export default {
    // Command data: name, description, and options
    data: new SlashCommandBuilder()
        .setName('soundtrack')
        .setDescription('Finds soundtrack details, composers, and trailers for a given film.')
        .addStringOption(option =>
            option.setName('film')
                .setDescription('The title of the film to find soundtrack details for.')
                .setRequired(true)),
    
    // Command execution logic
    async execute(interaction) {
        await interaction.deferReply(); // Acknowledge interaction quickly

        const filmQuery = interaction.options.getString('film');

        let tmdbMovie = null;
        let movieTitle = filmQuery; // Default title for display
        let movieYear = null;
        
        try {
            // 1. Attempt to find the movie on TMDB directly
            tmdbMovie = await searchMovieTMDB(filmQuery);

            if (!tmdbMovie) {
                // 2. If not found on TMDB, try to find it on Letterboxd to use the year as an aid for TMDB search
                const letterboxdSearchResults = await searchLetterboxd(filmQuery);
                const filmResult = letterboxdSearchResults.find(r => r.type === 'film');

                if (filmResult) {
                    console.log(`[Soundtrack Command] Found on Letterboxd: ${filmResult.title} (${filmResult.year})`);
                    movieTitle = filmResult.title; // Use Letterboxd title for display
                    movieYear = filmResult.year; // Use Letterboxd year for TMDB search
                    tmdbMovie = await searchMovieTMDB(filmResult.title, filmResult.year);
                }
            }

            // If movie is still not found after both attempts
            if (!tmdbMovie) {
                await interaction.editReply(`Could not find the film "${filmQuery}". Please try a different title.`);
                return;
            }

            // Update title and year if TMDB search was successful (TMDB data might be more accurate)
            movieTitle = tmdbMovie.title;
            movieYear = tmdbMovie.release_date ? new Date(tmdbMovie.release_date).getFullYear() : 'N/A';

            const soundtrackDetails = await getMovieSoundtrackDetailsTMDB(tmdbMovie.id);

            // Create the embed message
            const embed = new EmbedBuilder()
                .setColor(0x3498db) // A shade of blue for soundtracks
                .setTitle(`Soundtrack Details for ${movieTitle} (${movieYear}) 🎵`)
                .setURL(`https://www.themoviedb.org/movie/${tmdbMovie.id}`); // Link to the film's TMDB page

            if (tmdbMovie.poster_path) {
                embed.setThumbnail(getTmdbPosterUrl(tmdbMovie.poster_path, 'w92')); // Set movie poster as thumbnail
            }

            let description = '';

            // Add composers to the description
            if (soundtrackDetails.composers && soundtrackDetails.composers.length > 0) {
                description += `**Composers:** ${soundtrackDetails.composers.join(', ')}\n\n`;
            } else {
                description += '**Composers:** N/A\n\n';
            }

            // Add trailers to the description
            if (soundtrackDetails.trailers && soundtrackDetails.trailers.length > 0) {
                description += '**Trailers:**\n';
                soundtrackDetails.trailers.forEach((url, index) => {
                    description += `[Trailer ${index + 1}](${url})\n`;
                });
                description += '\n';
            }

            // Add OST / Main Themes videos to the description
            if (soundtrackDetails.ost_videos && soundtrackDetails.ost_videos.length > 0) {
                description += '**OST / Main Themes:**\n';
                soundtrackDetails.ost_videos.forEach((url, index) => {
                    description += `[Video ${index + 1}](${url})\n`;
                });
                description += '\n';
            }

            // If no details are found, set a default message
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