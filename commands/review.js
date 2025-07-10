// commands/review.js (Versão Corrigida)

import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } from 'discord.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import getRecentReviews from '../scraper/getReview.js';
import { searchMovieTMDB } from '../api/tmdb.js';
import { createReviewEmbed } from '../utils/formatEmbed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const usersFilePath = path.join(__dirname, '..', 'storage', 'users.json');

export const data = new SlashCommandBuilder()
    .setName('review')
    .setDescription('Mostra a última review ou busca uma review específica de um filme.')
    .addUserOption(option =>
        option.setName('usuario')
            .setDescription('Mencione outro usuário do Discord para ver a review dele.')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('filme')
            .setDescription('Título do filme para buscar uma review específica.')
            .setRequired(false));

// --- NOVA FUNÇÃO HELPER PARA PROCESSAR E ENVIAR O EMBED ---
// Isso evita repetição de código
async function processAndSendReview(interaction, review, letterboxdUsername, isUpdate = false) {
    // Validação crucial para evitar o erro de 'description required'
    if (!review || !review.filmTitle || !review.reviewUrl) {
        console.error('Erro de scraping: O objeto da review retornado é inválido.', review);
        const errorMessage = 'Não foi possível extrair os detalhes da review. O formato da página pode ter mudado.';
        if (isUpdate) { // Se for um update de um menu/botão
            return interaction.editReply({ content: errorMessage, embeds: [], components: [] });
        }
        return interaction.editReply({ content: errorMessage });
    }

    let tmdbDetails = null;
    if (review.filmTitle && review.filmYear) {
        try {
            tmdbDetails = await searchMovieTMDB(review.filmTitle, review.filmYear);
        } catch (tmdbError) {
            console.error(`Erro TMDB para ${review.filmTitle}:`, tmdbError.message);
        }
    }

    const embed = await createReviewEmbed(review, tmdbDetails, letterboxdUsername);
    
    const payload = { embeds: [embed], components: [] };
    if (!isUpdate) { // Se não for um update, podemos limpar o conteúdo
        payload.content = '';
    }

    await interaction.editReply(payload);
}


export async function execute(interaction) {
    const targetDiscordUser = interaction.options.getUser('usuario') || interaction.user;
    const filmQuery = interaction.options.getString('filme');

    // Validações iniciais com respostas efêmeras
    let users = {};
    try {
        const data = await fs.readFile(usersFilePath, 'utf8');
        users = JSON.parse(data);
    } catch (readError) {
        if (readError.code !== 'ENOENT') {
            return interaction.reply({ content: 'Erro interno ao buscar os vínculos de usuário.', flags: [MessageFlags.Ephemeral] });
        }
    }
    const letterboxdUsername = users[targetDiscordUser.id]?.letterboxd || users[targetDiscordUser.id];
    if (!letterboxdUsername) {
        const who = targetDiscordUser.id === interaction.user.id ? 'Você não vinculou sua conta' : `O usuário ${targetDiscordUser.displayName} não vinculou a conta`;
        return interaction.reply({ content: `${who} Letterboxd. Use /link.`, flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferReply();

    try {
        const allUserReviews = await getRecentReviews(letterboxdUsername);

        if (!allUserReviews || allUserReviews.length === 0) {
            return interaction.editReply({ content: `Não encontrei nenhuma review para \`${letterboxdUsername}\`.` });
        }

        if (filmQuery) {
            const filteredReviews = allUserReviews.filter(review =>
                review.filmTitle.toLowerCase().includes(filmQuery.toLowerCase())
            );

            if (filteredReviews.length === 0) {
                return interaction.editReply({ content: `Não encontrei nenhuma review para "${filmQuery}" no perfil de \`${letterboxdUsername}\`.` });
            } else if (filteredReviews.length === 1) {
                await processAndSendReview(interaction, filteredReviews[0], letterboxdUsername);
            } else {
                const reviewsToChoose = filteredReviews.slice(0, 25);
                const selectOptions = reviewsToChoose.map((review, index) => ({
                    label: `${review.filmTitle} (${review.filmYear || '????'})`,
                    description: `Nota: ${review.rating ? '⭐'.repeat(review.rating) : 'N/A'}`,
                    value: index.toString(),
                }));
                const selectMenu = new StringSelectMenuBuilder().setCustomId('select_review').setPlaceholder('Selecione a review que deseja ver...').addOptions(selectOptions);
                const row = new ActionRowBuilder().addComponents(selectMenu);

                const reply = await interaction.editReply({
                    content: `Encontrei ${filteredReviews.length} reviews para "${filmQuery}". Selecione uma:`,
                    components: [row],
                });

                try {
                    const selection = await reply.awaitMessageComponent({
                        filter: i => i.user.id === interaction.user.id && i.customId === 'select_review',
                        componentType: ComponentType.StringSelect,
                        time: 60000,
                    });
                    
                    const selectedIndex = parseInt(selection.values[0]);
                    const targetReview = reviewsToChoose[selectedIndex];
                    await processAndSendReview(selection, targetReview, letterboxdUsername, true);

                } catch (err) {
                    await interaction.editReply({ content: 'Você não selecionou nenhuma review a tempo.', components: [] });
                }
            }
        } else {
            // Se não forneceu 'filme', pega a última review
            const latestReview = allUserReviews[0];
            await processAndSendReview(interaction, latestReview, letterboxdUsername);
        }
    } catch (error) {
        console.error(`Erro no /review para ${targetDiscordUser.tag}:`, error);
        await interaction.editReply({ content: `Ocorreu um erro ao acessar as reviews deste usuário. Detalhes: ${error.message}` });
    }
}