import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getFullDiary } from '../scraper/getFullDiary.js';
import { saveDiaryEntries, checkIfEntryExists } from '../database/db.js';
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
        usersData = {};
    }

    let userEntry = usersData[user.id];
    if (!userEntry) {
        return interaction.reply({ content: 'Você precisa vincular sua conta com /link antes de sincronizar.', flags: [MessageFlags.Ephemeral] });
    } 
    // Garante que userEntry seja um objeto, caso ainda esteja no formato string
    if (typeof userEntry === 'string') {
        userEntry = { letterboxd: userEntry, last_sync_date: null };
        usersData[user.id] = userEntry; // Atualiza em usersData também
    }

    const letterboxdUsername = userEntry.letterboxd;

    if (!letterboxdUsername) {
        return interaction.reply({ content: 'Você precisa vincular sua conta com /link antes de sincronizar.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        console.log(`[Sync Command] Iniciando sincronização completa para ${user.id}...`);

        await interaction.editReply('Iniciando sincronização completa... Estou lendo todo o seu diário do Letterboxd. Isso pode levar vários minutos!');
        
        // getFullDiary não recebe lastSyncDate como filtro, ele busca tudo
        const diaryEntries = await getFullDiary(letterboxdUsername);

        if (!diaryEntries || diaryEntries.length === 0) {
            await interaction.editReply('Seu diário do Letterboxd parece estar vazio. Nada para sincronizar...');
            // Ainda atualiza o last_sync_date mesmo que não haja novas entradas para processar
            userEntry.last_sync_date = new Date().toISOString();
            await fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 4));
            return;
        }

        const entriesToSave = [];
        let skippedEntriesCount = 0;
        let newEntriesFound = 0;

        // Filtra as entradas, verificando se já existem no banco de dados usando o viewing_id
        for (const entry of diaryEntries) {
            const exists = await checkIfEntryExists(user.id, letterboxdUsername, entry.viewing_id); 
            if (!exists) {
                entriesToSave.push({
                    ...entry,
                    discord_id: user.id,
                    letterboxd_username: letterboxdUsername,
                });
                newEntriesFound++;
            } else {
                skippedEntriesCount++;
                // console.log(`[Sync Command Debug] Entrada já existe no DB (viewing_id: ${entry.viewing_id}), pulando: ${entry.title} (${entry.date})`); 
            }
        }

        if (entriesToSave.length === 0) {
            // MENSAGEM AJUSTADA
            await interaction.editReply('Você ainda não assistiu filmes novos...');
            // Atualiza o last_sync_date mesmo que não haja novas entradas
            userEntry.last_sync_date = new Date().toISOString();
            await fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 4));
            return;
        }

        await interaction.editReply(`Encontrei ${newEntriesFound} novos filmes :D`);

        const { changes } = await saveDiaryEntries(entriesToSave);
        
        // Atualiza o last_sync_date após a sincronização
        userEntry.last_sync_date = new Date().toISOString();
        await fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 4));
        
        await interaction.editReply(`Sincronização concluída! ${changes} filmes adicionados. (${skippedEntriesCount+changes} Filmes assistidos).`);

    } catch (error) {
        console.error('Erro durante o /sync:', error);
        await interaction.editReply(`Ocorreu um erro durante a sincronização: ${error.message}`);
    }
}
