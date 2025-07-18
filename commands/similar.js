import { SlashCommandBuilder } from 'discord.js';
import { searchMovieTMDB, getTmdbPosterUrl, getSimilarMoviesTMDB } from '../api/tmdb.js'; 
import { createGridImage } from '../utils/formatEmbed.js'; 
import { searchLetterboxd } from '../scraper/searchLetterboxd.js'; 

export default {
    data: new SlashCommandBuilder()
        .setName('similar')
        .setDescription('Finds movies similar to a given film.')
        .addStringOption(option =>
            option.setName('film')
                .setDescription('The title of the film to find similarities for.')
                .setRequired(true)),
    
    async execute(interaction) {
        await interaction.deferReply(); 

        const filmQuery = interaction.options.getString('film');

        let tmdbMovie = null;
        let originalFilmLetterboxdUrl = null;
        
        try {
            const letterboxdSearchResults = await searchLetterboxd(filmQuery); 
            const originalFilmLetterboxdResult = letterboxdSearchResults.find(r => r.type === 'film');

            if (originalFilmLetterboxdResult) {
                console.log(`[Similar Command] Found original film on Letterboxd: ${originalFilmLetterboxdResult.title} (${originalFilmLetterboxdResult.year}) - URL: ${originalFilmLetterboxdUrl}`);
                tmdbMovie = await searchMovieTMDB(originalFilmLetterboxdResult.title, originalFilmLetterboxdResult.year); 
            }

            if (!tmdbMovie) {
                console.log(`[Similar Command] Original film not found on Letterboxd or TMDB with Letterboxd year. Trying direct TMDB search for "${filmQuery}"...`);
                tmdbMovie = await searchMovieTMDB(filmQuery); 
            }

            if (!tmdbMovie) {
                await interaction.editReply(`Could not find the film "${filmQuery}" to search for similarities.`);
                return;
            }

            if (!originalFilmLetterboxdUrl && tmdbMovie.id) {
                originalFilmLetterboxdUrl = `https://www.themoviedb.org/movie/${tmdbMovie.id}`;
            }

            const similarMovies = await getSimilarMoviesTMDB(tmdbMovie.id); 

            if (!similarMovies || similarMovies.length === 0) {
                await interaction.editReply(`No similar movies found for "${tmdbMovie.title}".`);
                return;
            }

            const filmsForGrid = similarMovies.slice(0, 10).map((movie) => ({
                title: movie.title,
                year: movie.release_date ? new Date(movie.release_date).getFullYear() : 'N/A',
                slug: movie.id,
                posterUrl: movie.poster_path ? getTmdbPosterUrl(movie.poster_path, 'w342') : null, 
                tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`
            }));

            console.log("[Similar Command Debug] Films being passed to createGridImage:", filmsForGrid);

            const { embed, attachment } = await createGridImage(filmsForGrid, `Similar Films to ${tmdbMovie.title}`, 5, 2); 
            
            console.log("Embed Description from createGridImage (after call):", embed.description);

            if (tmdbMovie.id) {
                embed.setDescription(`Suggested films based on **[${tmdbMovie.title}](${originalFilmLetterboxdUrl})**.\n\n` + (embed.description || ''));
            }

            await interaction.editReply({ embeds: [embed], files: attachment ? [attachment] : [] });

        } catch (error) {
            console.error(`Error executing /similar command:`, error);
            await interaction.editReply('An error occurred while searching for similar films. Please try again later.');
        }
    }
};