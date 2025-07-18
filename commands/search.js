import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchMovieTMDB, getTmdbPosterUrl, searchPersonTMDB, getPersonDetailsTMDB } from '../api/tmdb.js';
import { searchLetterboxd } from '../scraper/searchLetterboxd.js';
import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js';

export const data = new SlashCommandBuilder()
    .setName('search')
    .setDescription('Searches for films or directors using TMDB.')
    .addStringOption(option => 
        option.setName('film')
            .setDescription('The title of the film to search for.')
            .setRequired(false))
    .addStringOption(option => 
        option.setName('director')
            .setDescription('The name of the director to search for.')
            .setRequired(false));

export async function execute(interaction) {
    const filmQuery = interaction.options.getString('film');
    const directorQuery = interaction.options.getString('director');

    if (filmQuery && directorQuery) {
        return interaction.reply({ 
            content: 'Please search for either a film OR a director, not both at the same time.',
            ephemeral: true 
        });
    }

    if (!filmQuery && !directorQuery) {
        return interaction.reply({ 
            content: 'Please provide a film title or a director name to search for.',
            ephemeral: true 
        });
    }

    await interaction.deferReply();

    try {
        if (filmQuery) {
            const movieData = await searchMovieTMDB(filmQuery);
            
            if (!movieData) {
                return interaction.editReply({ content: `No movie found for "${filmQuery}" on TMDB.`, ephemeral: true });
            }

            const letterboxdSearch = await searchLetterboxd(movieData.title);
            const filmResult = letterboxdSearch.find(r => r.type === 'film' && r.slug);
            
            let filmUrlLetterboxd = `https://www.themoviedb.org/movie/${movieData.id}`;
            if (filmResult) {
                filmUrlLetterboxd = `https://letterboxd.com/film/${filmResult.slug}`;
            }

            const filmEmbed = new EmbedBuilder()
                .setColor(0x00E054)
                .setTitle(`${movieData.title}`)
                .setURL(filmUrlLetterboxd)
                .setDescription(movieData.overview || 'Synopsis not available.')
                .addFields(
                    { name: 'Genres', value: movieData.genres.join(', ') || 'N/A', inline: true },
                    { name: 'Director(s)', value: movieData.directors.join(', ') || 'N/A', inline: true }, 
                    { name: 'TMDB Rating', value: movieData.vote_average ? `⭐ ${movieData.vote_average.toFixed(1)}/10` : 'N/A', inline: true }
                )
                .setImage(getTmdbPosterUrl(movieData.poster_path, 'w500'));

            await interaction.editReply({ embeds: [filmEmbed] });

        } else if (directorQuery) {
            const personData = await searchPersonTMDB(directorQuery);

            if (!personData) {
                return interaction.editReply({ content: `No director found for "${directorQuery}" on TMDB.`, ephemeral: true });
            }

            const letterboxdSearch = await searchLetterboxd(personData.name);
            const directorResult = letterboxdSearch.find(r => r.type === 'director' && r.pageUrl);
            
            let directorUrlLetterboxd = `https://www.themoviedb.org/person/${personData.id}`;
            if (directorResult) {
                directorUrlLetterboxd = `https://letterboxd.com${directorResult.pageUrl}`;
            }

            const directorDetails = await getPersonDetailsTMDB(personData.id);

            let biography = directorDetails.biography || 'Biography not available.';
            if (biography.length > 800) {
                biography = biography.substring(0, 800) + '...';
            }

            const directorEmbed = new EmbedBuilder()
                .setColor(0x445566)
                .setTitle(directorDetails.name)
                .setURL(directorUrlLetterboxd)
                .setDescription(biography)
                .setThumbnail(getTmdbPosterUrl(personData.profile_path, 'w500'));

            if (directorDetails.birthday) {
                directorEmbed.addFields({ 
                    name: 'Born', 
                    value: directorDetails.birthday.split('-').reverse().join('/'), 
                    inline: true 
                });
            }
            if (directorDetails.place_of_birth) {
                directorEmbed.addFields({ 
                    name: 'From', 
                    value: directorDetails.place_of_birth, 
                    inline: true 
                });
            }
            
            directorEmbed.addFields(
                { name: 'Known For', value: personData.known_for_department || 'N/A', inline: true }
            );
            
            await interaction.editReply({ embeds: [directorEmbed] });
        }
    } catch (error) {
        console.error('Error in /search command:', error);
        await interaction.editReply({ content: `An error occurred during the search: ${error.message}` });
    }
}