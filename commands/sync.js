// commands/sync.js

import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getFullDiary } from '../scraper/getFullDiary.js';
import { saveDiaryEntries } from '../database/db.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('sync')
    .setDescription('Sincroniza seu diário do Letterboxd com o bot para o ranking do servidor.');

export async function execute(interaction) {
    const user = interaction.user;

    let usersData;
    try {
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
    } catch (error) {
        return interaction.reply({ content: 'Erro ao ler o arquivo de usuários.', flags: [MessageFlags.Ephemeral] });
    }

    const userEntry = usersData[user.id];
    let letterboxdUsername;
    if (typeof userEntry === 'string') letterboxdUsername = userEntry;
    else if (typeof userEntry === 'object' && userEntry !== null) letterboxdUsername = userEntry.letterboxd;

    if (!letterboxdUsername) {
        return interaction.reply({ content: 'Você precisa vincular sua conta com /link antes de sincronizar.', flags: [MessageFlags.Ephemeral] });
    }

    // A sincronização é um processo demorado, então a resposta é efêmera.
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
        await interaction.editReply('Iniciando sincronização... Estou lendo todo o seu diário do Letterboxd. Isso pode levar vários minutos!');
        
        // Pega todas as entradas do diário
        const diaryEntries = await getFullDiary(letterboxdUsername);

        if (!diaryEntries || diaryEntries.length === 0) {
            return interaction.editReply('Seu diário do Letterboxd parece estar vazio. Nada para sincronizar.');
        }

        // Adiciona os dados do Discord e Letterboxd a cada entrada para salvar no DB
        const entriesToSave = diaryEntries.map(entry => ({
            ...entry,
            discord_id: user.id,
            letterboxd_username: letterboxdUsername,
        }));

        await interaction.editReply(`Encontrei ${entriesToSave.length} entradas no seu diário. Salvando no banco de dados...`);

        // Salva tudo no banco de dados
        await saveDiaryEntries(entriesToSave);
        
        await interaction.editReply(`Sincronização concluída! ${entriesToSave.length} entradas do seu diário foram processadas.`);

    } catch (error) {
        console.error('Erro durante o /sync:', error);
        await interaction.editReply(`Ocorreu um erro durante a sincronização: ${error.message}`);
    }
}