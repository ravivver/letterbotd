// commands/hint.js (Versão com campo de diretor)

import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getWatchlist } from '../scraper/getWatchlist.js';
import getFilmDetailsFromSlug from '../scraper/getFilmDetailsFromSlug.js';
import { searchMovieTMDB, getTmdbPosterUrl } from '../api/tmdb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('hint')
    .setDescription('Sugere um filme aleatório da watchlist de um usuário.')
    .addUserOption(option =>
        option.setName('user')
        .setDescription('O usuário para buscar a sugestão (padrão: você mesmo).')
        .setRequired(false));

export async function execute(interaction) {
    const targetDiscordUser = interaction.options.getUser('user') || interaction.user;
    
    let usersData;
    try {
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
    } catch (error) {
        return interaction.reply({ content: 'Erro ao ler o arquivo de usuários.', flags: [MessageFlags.Ephemeral] });
    }
    
    const userEntry = usersData[targetDiscordUser.id];
    let letterboxdUsername;
    if (typeof userEntry === 'string') letterboxdUsername = userEntry;
    else if (typeof userEntry === 'object' && userEntry !== null) letterboxdUsername = userEntry.letterboxd;

    if (!letterboxdUsername) {
        const who = targetDiscordUser.id === interaction.user.id ? 'Você não vinculou' : `O usuário ${targetDiscordUser.displayName} não vinculou`;
        return interaction.reply({ content: `${who} uma conta do Letterboxd. Use /link.`, flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply();

    const watchlist = await getWatchlist(letterboxdUsername);

    if (!watchlist || watchlist.length === 0) {
        return interaction.editReply({ content: `A watchlist de ${letterboxdUsername} está vazia!` });
    }

    const randomSlug = watchlist[Math.floor(Math.random() * watchlist.length)];

    try {
        const filmDetails = await getFilmDetailsFromSlug(randomSlug);
        if (!filmDetails) throw new Error('Não foi possível obter detalhes do filme sorteado no Letterboxd.');
        
        const movieDataTMDB = await searchMovieTMDB(filmDetails.title, filmDetails.year);
        if (!movieDataTMDB) throw new Error('Não foi possível encontrar os detalhes do filme no TMDB.');

        const hintEmbed = new EmbedBuilder()
            .setColor(0xF4B740)
            .setTitle(`Que tal assistir: ${filmDetails.title} (${filmDetails.year})?`)
            .setURL(`https://letterboxd.com/film/${randomSlug}/`)
            .setAuthor({ name: `Uma sugestão da watchlist de ${letterboxdUsername}` })
            .setDescription(movieDataTMDB.overview || 'Sinopse não disponível.')
            // --- ALTERAÇÃO AQUI ---
            .addFields(
                { name: 'Gêneros', value: movieDataTMDB.genres.join(', ') || 'N/A', inline: true },
                { name: 'Diretor(es)', value: movieDataTMDB.directors.join(', ') || 'N/A', inline: true }
            )
            // --- FIM DA ALTERAÇÃO ---
            .setImage(getTmdbPosterUrl(movieDataTMDB.poster_path, 'w500'))
        
        await interaction.editReply({ content: '', embeds: [hintEmbed] });

    } catch (error) {
        console.error('Erro no comando /hint:', error);
        await interaction.editReply({ content: `Ocorreu um erro ao buscar a sugestão: ${error.message}` });
    }
}