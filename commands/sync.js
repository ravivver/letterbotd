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
        userEntry = { letterboxd: null }; 
        usersData[user.id] = userEntry;
    } else if (typeof userEntry === 'string') {
        userEntry = { letterboxd: userEntry }; 
        usersData[user.id] = userEntry;
    }

    const letterboxdUsername = userEntry.letterboxd;

    if (!letterboxdUsername) {
        return interaction.reply({ content: 'Você precisa vincular sua conta com /link antes de sincronizar.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
        console.log(`[Sync Command] Iniciando sincronização completa para ${user.id}...`);

        await interaction.editReply('Iniciando sincronização completa... Estou lendo todo o seu diário do Letterboxd. Isso pode levar vários minutos!');
        
        const diaryEntries = await getFullDiary(letterboxdUsername);

        if (!diaryEntries || diaryEntries.length === 0) {
            await interaction.editReply('Seu diário do Letterboxd parece estar vazio. Nada para sincronizar.');
            return;
        }

        const entriesToSave = [];
        let skippedEntriesCount = 0;
        let newEntriesFound = 0;

        // Filtra as entradas, verificando se já existem no banco de dados usando o viewing_id
        for (const entry of diaryEntries) {
            // Agora passamos o viewing_id para a verificação
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
                console.log(`[Sync Command Debug] Entrada já existe no DB (viewing_id: ${entry.viewing_id}), pulando: ${entry.title} (${entry.date})`); 
            }
        }

        if (entriesToSave.length === 0) {
            await interaction.editReply(`Nenhuma nova entrada encontrada para adicionar ao banco de dados. ${skippedEntriesCount} entradas já existentes foram puladas.`);
            return;
        }

        await interaction.editReply(`Encontrei ${newEntriesFound} novas entradas no seu diário. Salvando no banco de dados...`);

        const { changes } = await saveDiaryEntries(entriesToSave);
        
        await interaction.editReply(`Sincronização concluída! ${changes} novas entradas foram adicionadas ao banco de dados. (${skippedEntriesCount} entradas já existentes foram puladas).`);

    } catch (error) {
        console.error('Erro durante o /sync:', error);
        await interaction.editReply(`Ocorreu um erro durante a sincronização: ${error.message}`);
    }
}
