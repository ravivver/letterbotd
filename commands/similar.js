// commands/similar.js

import { SlashCommandBuilder } from 'discord.js';
import { searchMovieTMDB, getTmdbPosterUrl, getSimilarMoviesTMDB } from '../api/tmdb.js'; 
import { createGridImage } from '../utils/formatEmbed.js'; 
import { searchLetterboxd } from '../scraper/searchLetterboxd.js'; 

export default {
    // Command data: name, description, and options
    data: new SlashCommandBuilder()
        .setName('similar')
        .setDescription('Finds movies similar to a given film.')
        .addStringOption(option =>
            option.setName('film')
                .setDescription('The title of the film to find similarities for.')
                .setRequired(true)),
    
    // Command execution logic
    async execute(interaction) {
        await interaction.deferReply(); // Acknowledge interaction quickly

        const filmQuery = interaction.options.getString('film');

        let tmdbMovie = null;
        let originalFilmLetterboxdUrl = null; // To store the Letterboxd URL of the original film
        
        try {
            // 1. Attempt to find the movie on Letterboxd first to get the slug (if available)
            const letterboxdSearchResults = await searchLetterboxd(filmQuery); 
            const originalFilmLetterboxdResult = letterboxdSearchResults.find(r => r.type === 'film');

            if (originalFilmLetterboxdResult) {
                // If found on Letterboxd, construct the URL and try to search on TMDB with the year
                originalFilmLetterboxdUrl = `https://letterboxd.com/film/${originalFilmLetterboxdResult.slug}/`;
                console.log(`[Similar Command] Found original film on Letterboxd: ${originalFilmLetterboxdResult.title} (${originalFilmLetterboxdResult.year}) - URL: ${originalFilmLetterboxdUrl}`);
                tmdbMovie = await searchMovieTMDB(originalFilmLetterboxdResult.title, originalFilmLetterboxdResult.year); 
            }

            // 2. If not found on Letterboxd OR if the TMDB search with Letterboxd year failed, try direct TMDB search
            if (!tmdbMovie) {
                console.log(`[Similar Command] Original film not found on Letterboxd or TMDB with Letterboxd year. Trying direct TMDB search for "${filmQuery}"...`);
                tmdbMovie = await searchMovieTMDB(filmQuery); 
            }

            // If the movie is still not found after both attempts
            if (!tmdbMovie) {
                await interaction.editReply(`Could not find the film "${filmQuery}" to search for similarities.`);
                return;
            }

            // If originalFilmLetterboxdUrl was not set (e.g., if film was only found on TMDB), use TMDB link as fallback
            if (!originalFilmLetterboxdUrl && tmdbMovie.id) {
                originalFilmLetterboxdUrl = `https://www.themoviedb.org/movie/${tmdbMovie.id}`;
            }

            // Fetch similar movies from TMDB using the found movie's ID
            const similarMovies = await getSimilarMoviesTMDB(tmdbMovie.id); 

            if (!similarMovies || similarMovies.length === 0) {
                await interaction.editReply(`No similar movies found for "${tmdbMovie.title}".`);
                return;
            }

            // Map similar movies to the format expected by createGridImage
            // The 'slug' here will be the TMDB ID, and links will be constructed for TMDB
            const filmsForGrid = similarMovies.slice(0, 10).map((movie) => ({ // Limit to top 10 similar movies for the grid
                title: movie.title,
                year: movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A',
                slug: movie.id, // Use TMDB ID as slug
                posterUrl: movie.poster_path ? getTmdbPosterUrl(movie.poster_path, 'w342') : null, 
                tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}` // Direct TMDB link
            }));

            // Debugging: Log the content of filmsForGrid
            console.log("[Similar Command Debug] Films being passed to createGridImage:", filmsForGrid);

            // Create the grid image and embed
            const { embed, attachment } = await createGridImage(filmsForGrid, `Similar Films to ${tmdbMovie.title}`, 5, 2); 
            
            // Adjust the embed description to include the original film's link
            console.log("Embed Description from createGridImage (after call):", embed.description);

            if (tmdbMovie.id) {
                embed.setDescription(`Suggested films based on **[${tmdbMovie.title}](${originalFilmLetterboxdUrl})**.\n\n` + (embed.description || ''));
            }

            // Send the reply with the embed and the attached image
            await interaction.editReply({ embeds: [embed], files: attachment ? [attachment] : [] });

        } catch (error) {
            console.error(`Error executing /similar command:`, error);
            await interaction.editReply('An error occurred while searching for similar films. Please try again later.');
        }
    }
};