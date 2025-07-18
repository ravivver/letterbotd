import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchMovieTMDB, getTmdbPosterUrl } from '../api/tmdb.js';
import { getTopWatchedFilms } from '../database/db.js';

export const data = new SlashCommandBuilder()
    .setName('top')
    .setDescription('Displays the top 5 most watched films in this server.');

export async function execute(interaction) {
    await interaction.deferReply();

    const guildId = interaction.guildId;

    if (!guildId) {
        await interaction.editReply('This command can only be used in a server.');
        return;
    }

    try {
        const rows = await getTopWatchedFilms(guildId, 5); 

        if (!rows || rows.length === 0) {
            return interaction.editReply('No movies have been watched in this server yet. Use the /sync command to add movies!');
        }

        const topFilm = rows[0];
        let topFilmDataTMDB = null;
        if (topFilm) {
            topFilmDataTMDB = await searchMovieTMDB(topFilm.film_title, topFilm.film_year);
        }

        const description = rows.map((row, index) => {
            const medals = ['🥇', '🥈', '🥉'];
            const rank = index < 3 ? `${medals[index]}` : `**#${index + 1}**`;
            const year = row.film_year ? `(${row.film_year})` : '';
            return `${rank} **[${row.film_title} ${year}](https://letterboxd.com/film/${row.film_slug}/)** - ${row.watch_count} watched`;
        }).join('\n');

        const topEmbed = new EmbedBuilder()
            .setColor(0xF4B740)
            .setTitle(`🏆 Top 5 Most Watched Films (Server)`)
            .setDescription(description)
            .setThumbnail(topFilmDataTMDB ? getTmdbPosterUrl(topFilmDataTMDB.poster_path) : null);

        await interaction.editReply({ embeds: [topEmbed] });

    } catch (error) {
        console.error('Error executing /top command:', error);
        await interaction.editReply('An error occurred while trying to fetch the server ranking.');
    }
}