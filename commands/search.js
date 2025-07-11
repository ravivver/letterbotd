import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } from 'discord.js';
import { searchLetterboxd, getDirectorFilms } from '../scraper/searchLetterboxd.js';
import { searchMovieTMDB, getTmdbPosterUrl, searchPersonTMDB, getPersonDetailsTMDB } from '../api/tmdb.js';
import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js';

export const data = new SlashCommandBuilder()
    .setName('search')
    .setDescription('Searches for a movie or director on Letterboxd.') // Translated
    .addStringOption(option =>
        option.setName('term') // Changed 'termo' to 'term'
            .setDescription('The name of the movie or director you want to search for.') // Translated
            .setRequired(true));

export async function execute(interaction) {
    const term = interaction.options.getString('term'); // Changed 'termo' to 'term'
    const searchResults = await searchLetterboxd(term);

    if (searchResults.length === 0) {
        return interaction.reply({ 
            content: `No results found for the search "${term}".`, // Translated
            ephemeral: true 
        });
    }

    await interaction.deferReply(); 
    
    const options = searchResults.map(result => {
        if (result.type === 'film') {
            return {
                label: `[Movie] ${result.title}`.substring(0, 100), // Translated
                description: result.year ? `Year: ${result.year}` : 'Movie', // Translated
                value: `film_${result.slug}`
            };
        } else if (result.type === 'director') {
            return {
                label: `[Director] ${result.name}`.substring(0, 100), // Translated
                description: 'Person', // Translated
                value: `director_${result.name}|${result.pageUrl}`
            };
        }
    }).filter(Boolean);

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('search_result_select')
        .setPlaceholder('Multiple results found. Select one.') // Translated
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const selectMessage = await interaction.editReply({
        content: `Found ${searchResults.length} result(s) for "${term}". Please choose one:`, // Translated
        components: [row]
    });

    const collector = selectMessage.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i => i.user.id === interaction.user.id && i.customId === 'search_result_select',
        time: 60_000
    });

    collector.on('collect', async i => {
        await i.update({ content: 'Here it is!', components: [] }); // Translated

        const selectedValue = i.values[0];
        const [type, ...rest] = selectedValue.split(/_(.*)/s);
        const identifier = rest[0];

        if (type === 'film') {
            await processFilmSelection(interaction, identifier);
        } else if (type === 'director') {
            const [name, pageUrl] = identifier.split('|');
            await processDirectorSelection(interaction, name, pageUrl);
        }
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.editReply({ content: 'Selection time has expired.', components: [] }); // Translated
        }
    });
}

async function processFilmSelection(interaction, slug) {
    try {
        const letterboxdDetails = await getFilmDetailsFromSlug(slug);
        if (!letterboxdDetails) throw new Error('Could not retrieve Letterboxd details.'); // Translated

        const movieData = await searchMovieTMDB(letterboxdDetails.title, letterboxdDetails.year);
        if (!movieData) throw new Error('Movie not found in TMDB database.'); // Translated

        const filmEmbed = new EmbedBuilder()
            .setColor(0x00E054)
            .setTitle(`${movieData.title} (${letterboxdDetails.year})`)
            .setURL(`https://letterboxd.com/film/${slug}`)
            .setDescription(movieData.overview || 'Synopsis not available.') // Translated
            .addFields(
                { name: 'Genres', value: movieData.genres.join(', ') || 'N/A', inline: true }, // Translated
                { name: 'TMDB Rating', value: movieData.vote_average ? `⭐ ${movieData.vote_average.toFixed(1)}/10` : 'N/A', inline: true } // Translated
            )
            .setImage(getTmdbPosterUrl(movieData.poster_path, 'w500'));

        await interaction.editReply({ embeds: [filmEmbed] });
    } catch (error) {
        console.error('Error processing film selection:', error); // Translated
        await interaction.editReply({ content: `An error occurred while fetching movie details: ${error.message}` }); // Translated
    }
}


async function processDirectorSelection(interaction, directorName, letterboxdUrl) {
    try {
        const [personResult, films] = await Promise.all([
            searchPersonTMDB(directorName),
            getDirectorFilms(letterboxdUrl)
        ]);

        if (!personResult) throw new Error('Director not found on TMDB.'); // Translated

        const personDetails = await getPersonDetailsTMDB(personResult.id);
        if (!personDetails) throw new Error('Could not retrieve director details from TMDB.'); // Translated

        let biography = personDetails.biography || 'Biography not available.'; // Translated
        if (biography.length > 800) {
            biography = biography.substring(0, 800) + '...';
        }

        const filmList = films.length > 0
            ? films.slice(0, 15).map(film => `• [${film.title}](https://letterboxd.com${film.slug})`).join('\n')
            : 'No movies found.'; // Translated
        
        const directorEmbed = new EmbedBuilder()
            .setColor(0x445566)
            .setTitle(personDetails.name)
            .setURL(`https://letterboxd.com${letterboxdUrl}`)
            .setDescription(biography)
            .setThumbnail(getTmdbPosterUrl(personDetails.profile_path, 'w500'));

        if (personDetails.birthday) {
            directorEmbed.addFields({ 
                name: 'Born', // Translated
                value: personDetails.birthday.split('-').reverse().join('/'), 
                inline: true 
            });
        }
        if (personDetails.place_of_birth) {
            directorEmbed.addFields({ 
                name: 'From', // Translated
                value: personDetails.place_of_birth, 
                inline: true 
            });
        }
        
        directorEmbed.addFields(
            { name: `Filmography (${films.length} films)`, value: filmList } // Translated
        );
        
        await interaction.editReply({ embeds: [directorEmbed] });

    } catch (error) {
        console.error('Error processing director selection:', error); // Translated
        await interaction.editReply({ content: `An error occurred while fetching director details: ${error.message}` }); // Translated
    }
}
