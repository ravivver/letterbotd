// commands/top.js (Versão Final)

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { searchMovieTMDB, getTmdbPosterUrl } from '../api/tmdb.js'; // Importamos a API do TMDB
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '..', 'database', 'letterbotd.db');

export const data = new SlashCommandBuilder()
    .setName('top')
    .setDescription('Exibe o top 5 filmes mais assistidos no servidor.');

export async function execute(interaction) {
    await interaction.deferReply();

    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
        if (err) {
            console.error('Erro ao conectar ao banco para o /top:', err.message);
            return interaction.editReply('Ocorreu um erro ao acessar o banco de dados.');
        }
    });

    const sql = `
        SELECT film_title, film_slug, film_year, COUNT(film_slug) as watch_count
        FROM watched_films
        GROUP BY film_slug
        ORDER BY watch_count DESC
        LIMIT 5;
    `;

    db.all(sql, [], async (err, rows) => {
        if (err) {
            console.error('Erro ao executar a query do /top:', err.message);
            db.close();
            return interaction.editReply('Ocorreu um erro ao buscar o ranking.');
        }

        if (!rows || rows.length === 0) {
            db.close();
            return interaction.editReply('Ainda não há filmes suficientes no banco de dados. Use o comando `/sync` para adicionar seus filmes!');
        }

        // Busca o pôster do filme #1 no TMDB
        const topFilm = rows[0];
        const topFilmDataTMDB = await searchMovieTMDB(topFilm.film_title, topFilm.film_year);

        const description = rows.map((row, index) => {
            const medals = ['🥇', '🥈', '🥉'];
            const rank = index < 3 ? `${medals[index]}` : `**#${index + 1}**`;
            // Adiciona o ano ao lado do título
            const year = row.film_year ? `(${row.film_year})` : '';
            return `${rank} **[${row.film_title} ${year}](https://letterboxd.com/film/${row.film_slug}/)** - ${row.watch_count} assistido(s)`;
        }).join('\n');

        const topEmbed = new EmbedBuilder()
            .setColor(0xF4B740)
            .setTitle(`🏆 Top 5 Filmes Mais Assistidos do Servidor`)
            .setDescription(description)
            // Adiciona a foto do filme #1 como miniatura
            .setThumbnail(topFilmDataTMDB ? getTmdbPosterUrl(topFilmDataTMDB.poster_path) : null);
            // Rodapé removido como solicitado

        await interaction.editReply({ embeds: [topEmbed] });

        db.close();
    });
}