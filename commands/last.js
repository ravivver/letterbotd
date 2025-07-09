// commands/last.js

import { SlashCommandBuilder, MessageFlags } from 'discord.js'; // Adicionado MessageFlags
import fs from 'node:fs/promises'; 
import path from 'node:path';
import { fileURLToPath } from 'node:url'; // Corrigido ' = ' para ' from '
import getRecentDiaryEntries from '../scraper/getDiary.js'; 
import { searchMovieTMDB } from '../api/tmdb.js'; 
import { createDiaryEmbed } from '../utils/formatEmbed.js'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('last') 
    .setDescription('Mostra o último filme assistido no Letterboxd de um usuário.') 
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('Mencione outro usuário do Discord para ver o último filme dele.')
            .setRequired(false));

export async function execute(interaction) {
    await interaction.deferReply(); // Deferral público por padrão

    let targetDiscordId = interaction.user.id; 
    let targetUserTag = interaction.user.tag; 

    const mentionedUser = interaction.options.getUser('usuario');
    if (mentionedUser) {
        targetDiscordId = mentionedUser.id;
        targetUserTag = mentionedUser.tag;
    }

    try {
        let users = {};
        try {
            const data = await fs.readFile(usersFilePath, 'utf8');
            users = JSON.parse(data);
        } catch (readError) {
            if (readError.code === 'ENOENT') {
                users = {};
            } else {
                console.error(`Erro ao ler users.json: ${readError.message}`);
                await interaction.editReply({
                    content: 'Ocorreu um erro interno ao buscar os vínculos de usuário. Por favor, tente novamente mais tarde.',
                    flags: MessageFlags.Ephemeral // EFÊMERO
                });
                return;
            }
        }

        const letterboxdUsername = users[targetDiscordId]; 

        if (!letterboxdUsername) {
            await interaction.editReply({
                content: `O usuário ${targetUserTag} não vinculou sua conta Letterboxd ainda. Peça para ele usar \`/link\`!`,
                flags: MessageFlags.Ephemeral // EFÊMERO
            });
            return;
        }

        const films = await getRecentDiaryEntries(letterboxdUsername);

        if (!films || films.length === 0) {
            await interaction.editReply({
                content: `Não encontrei nenhum filme no diário de \`${letterboxdUsername}\` ou o diário está vazio.`,
                flags: MessageFlags.Ephemeral // EFÊMERO
            });
            return;
        }

        const latestFilm = films[0]; 

        let tmdbDetails = null;
        if (latestFilm.title && latestFilm.year) {
             try {
                tmdbDetails = await searchMovieTMDB(latestFilm.title, latestFilm.year);
             } catch (tmdbError) {
                console.error(`Erro ao buscar TMDB para ${latestFilm.title}:`, tmdbError.message);
             }
        }

        const embed = createDiaryEmbed(latestFilm, tmdbDetails, letterboxdUsername);

        await interaction.editReply({ embeds: [embed], ephemeral: false }); 

    } catch (error) {
        console.error(`Erro ao processar comando /last para ${targetUserTag}:`, error);
        await interaction.editReply({
            content: `Ocorreu um erro ao acessar o Letterboxd deste usuário. Verifique se o nome está correto, anta. Detalhes: ${error.message}`,
            flags: MessageFlags.Ephemeral // EFÊMERO
        });
    }
}