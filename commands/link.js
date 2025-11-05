import { SlashCommandBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js';
import fs from 'node:fs/promises'; 
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkUserExists } from '../scraper/checkUserExists.js'; 
import { getFullDiary } from '../scraper/getFullDiary.js'; 
import { saveDiaryEntries } from '../database/db.js'; 
import { getUserBio } from '../scraper/getProfileStats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

const activeChallenges = new Map();
const CHALLENGE_TIMEOUT_MS = 300000; 

function generateAuthKey() {
    const words = ['cinema', 'screen', 'retia', 'movie', 'film', 'botd', 'tarantino', 'emanuel', 'kaxu', 'chad', 'auth', 'magic'];
    const key = Array.from({ length: 4 }, () => words[Math.floor(Math.random() * words.length)]).join(' ');
    return key;
}

export const data = new SlashCommandBuilder()
    .setName('link')
    .setDescription('Associates your Discord ID with a Letterboxd username.')
    .addStringOption(option =>
        option.setName('username')
            .setDescription('Your Letterboxd username (e.g., your_username)')
            .setRequired(true));

export async function execute(interaction) {
    const user = interaction.user;
    const discordId = user.id;
    const guildId = interaction.guildId;
    const letterboxdUsernameInput = interaction.options.getString('username').trim();
    
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

    let usersData;
    try {
        usersData = JSON.parse(await fs.readFile(usersFilePath, 'utf8'));
    } catch (error) {
        usersData = {};
    }
    
    let userEntry = usersData[discordId];
    let isAlreadyLinked = userEntry && userEntry.letterboxd;
    const currentLinkedUsername = isAlreadyLinked ? userEntry.letterboxd : null;

    if (!guildId) {
        return interaction.editReply({ content: 'This command can only be used in a server.' });
    }

    if (isAlreadyLinked) {
         return interaction.editReply({ 
             content: `Your account is already linked to **${currentLinkedUsername}**. Use \`/unlink\` to change the account.`,
             flags: MessageFlags.Ephemeral
         });
    }
    
    if (activeChallenges.has(discordId)) {
        clearTimeout(activeChallenges.get(discordId).timeoutId);
        activeChallenges.delete(discordId);
    }


    try {
        const userCheck = await checkUserExists(letterboxdUsernameInput);
        if (userCheck.status !== 'SUCCESS') {
            return interaction.editReply({ content: userCheck.message });
        }

        const authKey = generateAuthKey();
        
        const checkButtonId = `link_check_${discordId}`;
        const checkButton = new ButtonBuilder()
            .setCustomId(checkButtonId)
            .setLabel('Check Bio')
            .setStyle(ButtonStyle.Primary);

        const actionRow = new ActionRowBuilder().addComponents(checkButton);

        const instructions = [
            `1. **Add these secret words** to your [Letterboxd bio](https://letterboxd.com/settings/): \`${authKey}\``,
            `2. Click the button below to complete.`
        ].join('\n');

        const initialReply = await interaction.editReply({ 
            content: `**Authentication Challenge for @${letterboxdUsernameInput}:**\n\n${instructions}`,
            components: [actionRow]
        });

        const timeoutId = setTimeout(async () => {
            if (activeChallenges.has(discordId)) {
                await initialReply.edit({ content: 'Verification timed out. Please run the command again to start a new challenge.', components: [] }).catch(console.error);
                activeChallenges.delete(discordId);
            }
        }, CHALLENGE_TIMEOUT_MS);
        
        activeChallenges.set(discordId, { 
            username: letterboxdUsernameInput, 
            key: authKey, 
            timeoutId: timeoutId,
            interactionId: interaction.id
        });


        
        const collectorFilter = i => i.customId === checkButtonId && i.user.id === discordId;
        
        try {
            const buttonInteraction = await initialReply.awaitMessageComponent({
                filter: collectorFilter,
                componentType: ComponentType.Button,
                time: CHALLENGE_TIMEOUT_MS
            });
            
            await buttonInteraction.deferUpdate();

            const challenge = activeChallenges.get(discordId);

            if (!challenge) {
                return interaction.editReply({ content: 'Challenge expired. Please run the command again.', components: [] });
            }
            
            const bio = await getUserBio(challenge.username);

            if (bio && bio.includes(challenge.key)) {
                clearTimeout(challenge.timeoutId);
                activeChallenges.delete(discordId);

                const newLinkEntry = { letterboxd: challenge.username, last_sync_date: new Date().toISOString() };
                usersData[discordId] = newLinkEntry;
                await fs.writeFile(usersFilePath, JSON.stringify(usersData, null, 4));

                const diaryEntries = await getFullDiary(challenge.username);
                const syncData = diaryEntries.map(entry => ({
                    ...entry,
                    discord_id: discordId,
                    letterboxd_username: challenge.username,
                    guild_id: guildId
                }));
                const { changes } = await saveDiaryEntries(syncData);
                
                await interaction.editReply({ 
                    content: `✅ Authentication successful! Account **${challenge.username}** linked and initial synchronization complete! (${changes} new entries added to the database).`,
                    components: []
                });

            } else {
                await interaction.editReply({ 
                    content: `❌ Verification failed. The secret phrase **\`${challenge.key}\`** was not found in the bio of **${challenge.username}**. Please ensure it is saved correctly and try again by clicking the button.`,
                    components: [actionRow] 
                });
            }

        } catch (error) {
             if (error.message.includes('time')) {
             } else {
                 console.error(`Error during button verification for ${letterboxdUsernameInput}:`, error);
                 await interaction.editReply({ content: `An unexpected error occurred during verification: ${error.message}`, components: [] });
                 activeChallenges.delete(discordId);
             }
        }


    } catch (error) {
        console.error(`Error processing /link command:`, error);
        await interaction.editReply({
            content: `An error occurred while starting the link process: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}