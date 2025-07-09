// commands/unlink.js

import { SlashCommandBuilder, MessageFlags } from 'discord.js'; // Adicionado MessageFlags
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url'; // Corrigido ' = ' para ' from '

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('unlink')
    .setDescription('Desvincula sua conta Letterboxd do bot.');

export async function execute(interaction) {
    // Deferral efêmero, pois a resposta final é sempre efêmera.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); 

    const discordId = interaction.user.id;
    const userTag = interaction.user.tag;

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
                    content: 'Ocorreu um erro interno ao tentar ler os vínculos de usuário. Por favor, tente novamente mais tarde.',
                    flags: MessageFlags.Ephemeral // EFÊMERO
                });
                return;
            }
        }

        if (users[discordId]) {
            delete users[discordId]; 
            await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), 'utf8'); 

            await interaction.editReply({
                content: `Sua conta Letterboxd foi desvinculada com sucesso!`,
                flags: MessageFlags.Ephemeral // EFÊMERO
            });
        } else {
            await interaction.editReply({
                content: `Você não tem uma conta Letterboxd vinculada para desvincular. Use \`/link\` para vincular uma.`,
                flags: MessageFlags.Ephemeral // EFÊMERO
            });
        }

    } catch (error) {
        console.error(`Erro ao processar comando /unlink para ${userTag}:`, error);
        await interaction.editReply({
            content: `Ocorreu um erro inesperado ao desvincular sua conta. Detalhes: ${error.message}`,
            flags: MessageFlags.Ephemeral // EFÊMERO
        });
    }
}