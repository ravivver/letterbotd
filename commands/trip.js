import { SlashCommandBuilder } from 'discord.js';
import { discoverMoviesTMDB, getTmdbGenres, getTmdbPosterUrl } from '../api/tmdb.js';
import { createMovieEmbed } from '../utils/formatEmbed.js';
import { searchLetterboxd } from '../scraper/searchLetterboxd.js';

export default {
    data: new SlashCommandBuilder()
        .setName('trip')
        .setDescription('Finds movies based on year, genre, or country.')
        .addIntegerOption(option =>
            option.setName('year')
                .setDescription('The release year of the film.')
                .setRequired(false)
                .setMinValue(1874)
                .setMaxValue(new Date().getFullYear() + 5)
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
    async execute(interaction) {
        await interaction.deferReply();

        const year = interaction.options.getInteger('year');
        let genreName = interaction.options.getString('genre');
        const countryCode = interaction.options.getString('country');

        const filters = {};
        if (year) filters.year = year;
        if (countryCode) filters.countryCode = countryCode.toUpperCase();

        let genreIds = null;
        const allGenres = await getTmdbGenres();
        if (genreName) {
            const matchedGenre = allGenres.find(g => g.name.toLowerCase() === genreName.toLowerCase());
            if (matchedGenre) {
                genreIds = matchedGenre.id.toString();
                filters.genreIds = genreIds;
            } else {
                await interaction.editReply(`Could not find the genre "${genreName}". Please check the spelling or try a different genre.`);
                return;
            }
        }

        if (Object.keys(filters).length === 0) {
            await interaction.editReply('Please provide at least one filter (year, genre, or country) for your search.');
            return;
        }

        const movies = await discoverMoviesTMDB(filters);

        if (movies.length === 0) {
            await interaction.editReply('No films found with the specified filters. Try other criteria!');
            return;
        }

        const randomIndex = Math.floor(Math.random() * movies.length);
        const movieToShow = movies[randomIndex];

        const posterUrl = getTmdbPosterUrl(movieToShow.poster_path);
        
        let letterboxdUrl = null;
        const movieYearForLetterboxd = movieToShow.release_date ? new Date(movieToShow.release_date).getFullYear().toString() : null;
        
        console.log(`[Trip Debug] Searching Letterboxd for: "${movieToShow.title}" (TMDB Year: ${movieYearForLetterboxd})`);

        const letterboxdSearchResults = await searchLetterboxd(movieToShow.title);
        
        const foundFilmInLetterboxd = letterboxdSearchResults.find(result => {
            const isFilm = result.type === 'film';
            const titleMatches = result.title.toLowerCase() === movieToShow.title.toLowerCase();
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
        
        const finalFilmUrl = letterboxdUrl || `https://www.themoviedb.org/movie/${movieToShow.id}`;

        const genreNames = movieToShow.genre_ids.map(id => {
            const genre = allGenres.find(g => g.id === id);
            return genre ? genre.name : 'Unknown Genre'; 
        });
        console.log(`[Trip Debug] Mapped Genre Names: ${genreNames.join(', ')}`);

        const embed = createMovieEmbed(movieToShow, posterUrl, genreNames, finalFilmUrl); 
        await interaction.editReply({ embeds: [embed] });
    },
};