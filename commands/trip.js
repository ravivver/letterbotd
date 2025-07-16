// commands/trip.js

import { SlashCommandBuilder } from 'discord.js';
import { discoverMoviesTMDB, getTmdbGenres, getTmdbPosterUrl } from '../api/tmdb.js';
import { createMovieEmbed } from '../utils/formatEmbed.js';
import { searchLetterboxd } from '../scraper/searchLetterboxd.js';

export default {
    // Command data: name, description, and options
    data: new SlashCommandBuilder()
        .setName('trip')
        .setDescription('Finds movies based on year, genre, or country.')
        .addIntegerOption(option =>
            option.setName('year')
                .setDescription('The release year of the film.')
                .setRequired(false)
                .setMinValue(1874)
                .setMaxValue(new Date().getFullYear() + 5) // Allows up to 5 years into the future
        )
        .addStringOption(option =>
            option.setName('genre')
                .setDescription('The genre of the film (e.g., Action, Comedy, Horror).')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('country')
                .setDescription('The ISO 3166-1 country code of origin (e.g., US, BR, GB).')
                .setRequired(false)
                .setMinLength(2)
                .setMaxLength(2)
        ),
    // Command execution logic
    async execute(interaction) {
        await interaction.deferReply(); // Acknowledge interaction quickly

        const year = interaction.options.getInteger('year');
        let genreName = interaction.options.getString('genre');
        const countryCode = interaction.options.getString('country');

        const filters = {};
        if (year) filters.year = year;
        if (countryCode) filters.countryCode = countryCode.toUpperCase(); // Ensure uppercase for country code

        let genreIds = null;
        const allGenres = await getTmdbGenres(); // Fetch all available genres from TMDB
        if (genreName) {
            // Find the genre ID based on the provided genre name (case-insensitive)
            const matchedGenre = allGenres.find(g => g.name.toLowerCase() === genreName.toLowerCase());
            if (matchedGenre) {
                genreIds = matchedGenre.id.toString();
                filters.genreIds = genreIds;
            } else {
                // Inform user if genre is not found
                await interaction.editReply(`Could not find the genre "${genreName}". Please check the spelling or try a different genre.`);
                return;
            }
        }

        // Require at least one filter for the search
        if (Object.keys(filters).length === 0) {
            await interaction.editReply('Please provide at least one filter (year, genre, or country) for your search.');
            return;
        }

        const movies = await discoverMoviesTMDB(filters); // Discover movies based on filters

        if (movies.length === 0) {
            await interaction.editReply('No films found with the specified filters. Try other criteria!');
            return;
        }

        // Select a random movie from the results
        const randomIndex = Math.floor(Math.random() * movies.length);
        const movieToShow = movies[randomIndex];

        const posterUrl = getTmdbPosterUrl(movieToShow.poster_path);
        
        let letterboxdUrl = null;
        // Extract release year for Letterboxd search
        const movieYearForLetterboxd = movieToShow.release_date ? new Date(movieToShow.release_date).getFullYear().toString() : null;
        
        console.log(`[Trip Debug] Searching Letterboxd for: "${movieToShow.title}" (TMDB Year: ${movieYearForLetterboxd})`);

        const letterboxdSearchResults = await searchLetterboxd(movieToShow.title);
        
        // Try to find a matching film in Letterboxd search results
        const foundFilmInLetterboxd = letterboxdSearchResults.find(result => {
            const isFilm = result.type === 'film';
            const titleMatches = result.title.toLowerCase() === movieToShow.title.toLowerCase();
            // Year must match or be null in Letterboxd result (if not available)
            const yearMatches = (movieYearForLetterboxd && result.year === movieYearForLetterboxd) || !result.year;
            
            console.log(`  [Trip Debug] LB Result: Title="${result.title}", Year="${result.year}" | Match -> Film:${isFilm}, Title:${titleMatches}, Year:${yearMatches}`);
            
            return isFilm && titleMatches && yearMatches;
        });

        if (foundFilmInLetterboxd) {
            letterboxdUrl = `https://letterboxd.com/film/${foundFilmInLetterboxd.slug}/`;
            console.log(`[Trip Debug] Found Letterboxd URL: ${letterboxdUrl}`);
        } else {
            console.log(`[Trip Debug] Letterboxd URL not found for "${movieToShow.title}" (${movieYearForLetterboxd}). Falling back to TMDB.`);
        }
        
        // Determine the final URL to link in the embed (Letterboxd preferred, then TMDB)
        const finalFilmUrl = letterboxdUrl || `https://www.themoviedb.org/movie/${movieToShow.id}`;

        // Map genre IDs from the movie object to their names
        const genreNames = movieToShow.genre_ids.map(id => {
            const genre = allGenres.find(g => g.id === id);
            return genre ? genre.name : 'Unknown Genre'; 
        });
        console.log(`[Trip Debug] Mapped Genre Names: ${genreNames.join(', ')}`);

        // Create and send the movie embed
        const embed = createMovieEmbed(movieToShow, posterUrl, genreNames, finalFilmUrl); 
        await interaction.editReply({ embeds: [embed] });
    },
};