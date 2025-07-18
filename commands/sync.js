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
    .setDescription('Synchronizes your Letterboxd diary with the bot for the server ranking.');

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
        return interaction.reply({ content: 'You need to link your account with /link before synchronizing.', flags: [MessageFlags.Ephemeral] });
    } 
    if (typeof userEntry === 'string') {
        userEntry = { letterboxd: userEntry, last_sync_date: null };
        usersData[user.id] = userEntry;
    }

    const letterboxdUsername = userEntry.letterboxd;
    const guildId = interaction.guildId;

    if (!guildId) {
        await interaction.editReply({ content: 'This command can only be used in a server.', flags: MessageFlags.Ephemeral });
        return;
    }

    if (!letterboxdUsername) {
        return interaction.reply({ content: 'You need to link your account with /link before synchronizing.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        console.log(`[Sync Command] Starting full synchronization for ${user.id} in guild ${guildId}...`);

        await interaction.editReply('Starting full synchronization... I\'m reading your entire Letterboxd diary. This may take several minutes!');
        
        const diaryEntries = await getFullDiary(letterboxdUsername);

        if (!diaryEntries || diaryEntries.length === 0) {
            await interaction.editReply('Your Letterboxd diary appears to be empty. Nothing to synchronize...');
            userEntry.last_sync_date = new Date().toISOString();
            await fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 4));
            return;
        }

        const entriesToSave = [];
        let skippedEntriesCount = 0;
        let newEntriesFound = 0;

        for (const entry of diaryEntries) {
            const exists = await checkIfEntryExists(user.id, letterboxdUsername, entry.viewing_id, guildId); 
            if (!exists) {
                entriesToSave.push({
                    ...entry,
                    discord_id: user.id,
                    letterboxd_username: letterboxdUsername,
                    guild_id: guildId
                });
                newEntriesFound++;
            } else {
                skippedEntriesCount++;
            }
        }

        if (entriesToSave.length === 0) {
            await interaction.editReply('You haven\'t watched any new movies.');
            userEntry.last_sync_date = new Date().toISOString();
            await fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 4));
            return;
        }

        await interaction.editReply(`Found ${newEntriesFound} new movies :D`);

        const { changes } = await saveDiaryEntries(entriesToSave);
        
        userEntry.last_sync_date = new Date().toISOString();
        await fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 4));
        
        await interaction.editReply(`Synchronization complete! ${changes} movies added.`);

    } catch (error) {
        console.error('Error during /sync:', error);
        await interaction.editReply(`An error occurred during synchronization: ${error.message}`);
    }
}