import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchMovieTMDB, getTmdbPosterUrl } from '../api/tmdb.js';
import { getTopWatchedFilms } from '../database/db.js'; // Importa a nova função

export const data = new SlashCommandBuilder()
    .setName('top')
    .setDescription('Exibe o top 5 filmes mais assistidos no servidor.');

export async function execute(interaction) {
    await interaction.deferReply();

    try {
        // Usa a função getTopWatchedFilms do db.js para buscar os dados
        const rows = await getTopWatchedFilms(interaction.guildId, 5); 

        if (!rows || rows.length === 0) {
            return interaction.editReply('Ainda não há filmes suficientes no banco de dados. Use o comando `/sync` para adicionar seus filmes!');
        }

        // Busca o pôster do filme #1 no TMDB
        const topFilm = rows[0];
        let topFilmDataTMDB = null;
        if (topFilm) {
            topFilmDataTMDB = await searchMovieTMDB(topFilm.film_title, topFilm.film_year);
        }

        const description = rows.map((row, index) => {
            const medals = ['🥇', '🥈', '🥉'];
            const rank = index < 3 ? `${medals[index]}` : `**#${index + 1}**`;
            const year = row.film_year ? `(${row.film_year})` : '';
            // Usando film_slug para criar o link do Letterboxd
            return `${rank} **[${row.film_title} ${year}](https://letterboxd.com/film/${row.film_slug}/)** - ${row.watch_count} assistido(s)`;
        }).join('\n');

        const topEmbed = new EmbedBuilder()
            .setColor(0xF4B740)
            .setTitle(`🏆 Top 5 Filmes Mais Assistidos do Servidor`)
            .setDescription(description)
            .setThumbnail(topFilmDataTMDB ? getTmdbPosterUrl(topFilmDataTMDB.poster_path) : null);

        await interaction.editReply({ embeds: [topEmbed] });

    } catch (error) {
        console.error('Erro ao executar o comando /top:', error);
        await interaction.editReply('Ocorreu um erro ao tentar buscar o ranking de filmes.');
    }
}
