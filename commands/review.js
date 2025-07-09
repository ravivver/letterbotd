// commands/review.js

import { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } from 'discord.js';
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

export async function execute(interaction) {
    let targetDiscordId = interaction.user.id;
    let targetUserTag = interaction.user.tag;

    const mentionedUser = interaction.options.getUser('usuario');
    if (mentionedUser) {
        targetDiscordId = mentionedUser.id;
        targetUserTag = mentionedUser.tag;
    }

    const filmQuery = interaction.options.getString('filme');

    // Nao usamos deferReply() aqui no inicio, porque a primeira resposta
    // pode ser um reply() efêmero (erros iniciais) ou um deferReply() público.

    try {
        let users = {};
        try {
            const data = await fs.readFile(usersFilePath, 'utf8');
            users = JSON.parse(data);
        } catch (readError) {
            if (readError.code !== 'ENOENT') {
                console.error(`Erro ao ler users.json: ${readError.message}`);
                await interaction.reply({
                    content: 'Erro interno ao buscar os vínculos de usuário. Por favor, tente novamente mais tarde.',
                    ephemeral: true
                });
                return;
            }
        }

        const letterboxdUsername = users[targetDiscordId];
        if (!letterboxdUsername) {
            await interaction.reply({
                content: `O usuário ${targetUserTag} não vinculou sua conta Letterboxd ainda. Peça para ele usar \`/link\`!`,
                ephemeral: true
            });
            return;
        }

        // Deferir a resposta APENAS AGORA que sabemos que a interação prosseguirá e provavelmente
        // precisará de um tempo para buscar reviews ou exibir o menu.
        // Faremos o deferral público, pois a resposta final (o embed da review) é pública.
        await interaction.deferReply();

        const allUserReviews = await getRecentReviews(letterboxdUsername);

        if (!allUserReviews || allUserReviews.length === 0) {
            await interaction.editReply({
                content: `Não encontrei nenhuma review para \`${letterboxdUsername}\` ou o perfil não tem reviews públicas.`,
            });
            return;
        }

        let targetReview = null;
        let reviewsToChoose = []; // Array para armazenar as reviews que o usuário pode escolher

        if (filmQuery) {
            // Filtra as reviews pelo título do filme (case-insensitive)
            const filteredReviews = allUserReviews.filter(review =>
                review.filmTitle.toLowerCase().includes(filmQuery.toLowerCase())
            );

            if (filteredReviews.length === 0) {
                await interaction.editReply({ // editReply porque já deferimos
                    content: `Não encontrei nenhuma review para "${filmQuery}" no perfil de \`${letterboxdUsername}\`.`,
                });
                return;
            } else if (filteredReviews.length === 1) {
                // Se apenas uma review foi encontrada, exibe ela diretamente
                targetReview = filteredReviews[0];
            } else {
                // Múltiplas reviews encontradas, prepara o StringSelectMenu
                reviewsToChoose = filteredReviews.slice(0, 25); // Limita a 25 opções para o select menu
                
                const selectOptions = reviewsToChoose.map((review, index) => ({
                    label: `${review.filmTitle} (${review.filmYear || 'Ano Desconhecido'})`,
                    description: `Avaliação: ${review.rating ? review.rating + ' estrelas' : 'N/A'} - ${review.reviewDate}`,
                    value: index.toString(), // Usamos o índice na array para identificar a escolha
                }));

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select-review')
                    .setPlaceholder('Selecione a review que deseja ver...')
                    .addOptions(selectOptions);

                const row = new ActionRowBuilder()
                    .addComponents(selectMenu);

                await interaction.editReply({
                    content: `Encontrei ${filteredReviews.length} reviews de filmes relacionados a "${filmQuery}". Por favor, selecione uma da lista:`,
                    components: [row],
                    ephemeral: false // Esta mensagem com o menu é pública
                });

                // --- Coletor de Interação para o StringSelectMenu ---
                const collector = interaction.channel.createMessageComponentCollector({
                    componentType: ComponentType.StringSelect,
                    filter: i => i.customId === 'select-review' && i.user.id === interaction.user.id,
                    time: 60000, // 60 segundos para responder
                });

                collector.on('collect', async i => {
                    await i.deferUpdate(); // Deferir a atualização da interação do select menu

                    const selectedIndex = parseInt(i.values[0]);
                    targetReview = reviewsToChoose[selectedIndex];

                    // Remover o menu após a seleção
                    await i.editReply({ content: 'Review selecionada:', components: [] }); // Remove o menu

                    // Agora que temos a review alvo, processamos e exibimos o embed
                    let tmdbDetails = null;
                    if (targetReview.filmTitle && targetReview.filmYear) {
                        try {
                            tmdbDetails = await searchMovieTMDB(targetReview.filmTitle, targetReview.filmYear);
                        } catch (tmdbError) {
                            console.error(`Erro TMDB para ${targetReview.filmTitle}:`, tmdbError.message);
                        }
                    }

                    const embed = createReviewEmbed(targetReview, tmdbDetails, letterboxdUsername);
                    await interaction.editReply({ embeds: [embed] }); // Edita a mensagem original com o embed
                    collector.stop(); // Para o coletor após a seleção
                });

                collector.on('end', collected => {
                    if (collected.size === 0) {
                        // Se o usuário não selecionou nada dentro do tempo limite
                        interaction.editReply({ content: 'Você não selecionou nenhuma review a tempo. Por favor, tente o comando novamente.', components: [] })
                            .catch(console.error); // Lida com erro caso a interação já tenha sido excluída
                    }
                });

                return; // Importante para não continuar o fluxo principal enquanto espera a seleção
            }
        } else {
            // Se não forneceu 'filme', pega a última review (comportamento default)
            targetReview = allUserReviews[0];
        }

        // Se chegamos aqui, ou um filme específico foi encontrado (único) ou a última review
        if (!targetReview) {
            // Este caso só ocorreria se allUserReviews não estivesse vazio, mas targetReview
            // não foi definido por alguma lógica inesperada.
            // É mais um fallback de segurança.
            await interaction.editReply({
                content: `Não foi possível determinar a review a ser exibida. Por favor, tente novamente.`,
            });
            return;
        }

        // Processa e exibe a review final (seja única ou a última)
        let tmdbDetails = null;
        if (targetReview.filmTitle && targetReview.filmYear) {
            try {
                tmdbDetails = await searchMovieTMDB(targetReview.filmTitle, targetReview.filmYear);
            } catch (tmdbError) {
                console.error(`Erro TMDB para ${targetReview.filmTitle}:`, tmdbError.message);
            }
        }

        const embed = createReviewEmbed(targetReview, tmdbDetails, letterboxdUsername);
        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(`Erro no /review para ${targetUserTag}:`, error);
        // Usamos editReply aqui porque deferReply já foi chamado para a maioria dos casos de erro.
        // Se um erro ocorrer antes do deferReply, o primeiro `reply` efêmero será usado.
        if (interaction.deferred || interaction.replied) { // Verifica se já houve deferral/resposta
             await interaction.editReply({
                 content: `Ocorreu um erro ao acessar as reviews deste usuário. Detalhes: ${error.message}`,
             });
        } else { // Se não houve deferral/resposta ainda, usa reply efêmero
            await interaction.reply({
                 content: `Ocorreu um erro ao acessar as reviews deste usuário. Detalhes: ${error.message}`,
                 ephemeral: true
            });
        }
    }
}