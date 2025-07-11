// commands/link.js
import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises'; 
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkUserExists } from '../scraper/checkUserExists.js'; 
import { getFullDiary } from '../scraper/getFullDiary.js'; 
import { saveDiaryEntries } from '../database/db.js'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('link')
    .setDescription('Associa seu ID do Discord a um nome de usuário do Letterboxd.')
    .addStringOption(option =>
        option.setName('username')
            .setDescription('Seu nome de usuário no Letterboxd (ex: seu_usuario)')
            .setRequired(true));

export async function execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

    const letterboxdUsername = interaction.options.getString('username').trim();
    const discordId = interaction.user.id;

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
                content: 'Ocorreu um erro interno ao tentar ler os vínculos de usuário. Por favor, tente novamente mais tarde.',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    for (const id in users) {
        let linkedUsername;
        if (typeof users[id] === 'string') {
            linkedUsername = users[id];
        } else if (typeof users[id] === 'object' && users[id] !== null) {
            linkedUsername = users[id].letterboxd;
        }

        if (linkedUsername && linkedUsername.toLowerCase() === letterboxdUsername.toLowerCase() && id !== discordId) {
            await interaction.editReply({
                content: `O nome de usuário \`${letterboxdUsername}\` já está vinculado a outra conta do Discord. Por favor, entre em contato com um administrador para resolver isso.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }
    }

    const verification = await checkUserExists(letterboxdUsername);

    if (verification.status !== 'SUCCESS') {
        await interaction.editReply({ 
            content: `Não foi possível vincular: ${verification.message}`,
            flags: MessageFlags.Ephemeral
        });
        return; 
    }

    try {
        users[discordId] = {
            letterboxd: letterboxdUsername,
            last_sync_date: null 
        };

        await fs.writeFile(usersFilePath, JSON.stringify(users, null, 4), 'utf8');

        // MENSAGEM AJUSTADA
        await interaction.editReply({
            content: `Seu Discord foi vinculado ao perfil do Letterboxd: \`${letterboxdUsername}\`. Sincronizando seu diário...`,
            flags: MessageFlags.Ephemeral
        });

        // --- SINCRONIZAÇÃO INICIAL AUTOMÁTICA ---
        try {
            const diaryEntries = await getFullDiary(letterboxdUsername); 

            if (!diaryEntries || diaryEntries.length === 0) {
                await interaction.followUp({ content: 'Seu diário do Letterboxd parece estar vazio ou não tem entradas. Nada para sincronizar inicialmente.', flags: MessageFlags.Ephemeral });
            } else {
                // Para a sincronização inicial, vamos tentar salvar todas as entradas diretamente.
                // A unicidade será garantida pela UNIQUE constraint no DB.
                const { changes } = await saveDiaryEntries(diaryEntries.map(entry => ({
                    ...entry,
                    discord_id: discordId,
                    letterboxd_username: letterboxdUsername,
                })));
                
                // Atualiza o last_sync_date APÓS a sincronização inicial
                users[discordId].last_sync_date = new Date().toISOString();
                await fs.writeFile(usersFilePath, JSON.stringify(users, null, 4));

                // MENSAGEM AJUSTADA
                await interaction.followUp({ 
                    content: `Sincronização inicial concluída! (${changes} novas entradas foram adicionadas ao banco de dados).`,
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (syncError) {
            console.error(`Erro durante a sincronização inicial do /link para ${letterboxdUsername}:`, syncError);
            await interaction.followUp({
                content: `Ocorreu um erro durante a sincronização inicial do seu diário: ${syncError.message}. Você pode tentar usar \`/sync\` mais tarde.`,
                flags: MessageFlags.Ephemeral
            });
        }

    } catch (error) {
        console.error(`Erro ao vincular usuário ${discordId} com ${letterboxdUsername}:`, error);
        await interaction.editReply({
            content: `Ocorreu um erro ao vincular sua conta Letterboxd. Detalhes: ${error.message}`,
            flags: MessageFlags.Ephemeral
        });
    }
}
